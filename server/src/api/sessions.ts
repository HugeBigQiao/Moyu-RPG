/**
 * 会话接口。
 *
 * 职责：
 *     开团（固定剧本 / 随机任务）、取当前状态、执行一次行动并落日志。
 * 为什么需要：
 *     一局的状态推进必须只有一个入口，否则日志与结算会重复。
 * 上下游：
 *     上游：core/{session,mission,npc}、db；下游：前端处置台。
 */
import { randomUUID } from 'node:crypto'
import type { Context } from 'cordis'
import { Roller, newSeed } from '../core/dice.ts'
import { generate } from '../core/mission.ts'
import { pickCity } from '../core/npc.ts'
import { act, newState, view } from '../core/session.ts'
import type { Scenario } from '../content/scenarios.ts'
import { HttpError, sendJson } from '../plugins/http.ts'
import {
  cardOf, getCharacter, getSession, insertLog, insertSession, nextLogSeq,
  updateCharacter, updateSession,
} from '../db/repo.ts'
import { parseBody } from './common.ts'
import { ActIn, RandomSessionIn, SessionIn } from './schemas.ts'

export function registerSessions(ctx: Context): void {
  const content = ctx.content
  const db = ctx.db
  const server = ctx.server

  server.post('/api/sessions', async (req, res) => {
    const body = await parseBody(req, SessionIn)
    const ch = await getCharacter(db, body.character_id)
    if (!ch) throw new HttpError(404, '没有这个节点')
    const scenario = content.data.scenarios.byId.get(body.scenario_id)
    if (!scenario) throw new HttpError(404, '没有这个作业手册')

    const state = newState(content.data, cardOf(ch), scenario)
    const opening = scenario.scenes[0]
    // 会话行与开场日志必须一起成功，否则会留下没有日志的空会话
    const session = await db.transaction(async (tx) => {
      const row = await startRow(tx, scenario.code, {
        character_id: ch.id,
        scenario_id: body.scenario_id,
        status: 'active',
        state,
        seed: state.seed,
      })
      await insertLog(tx, row.id, 1, {
        kind: 'scene',
        severity: 'info',
        text: `接入：${opening.place ?? ''}｜${opening.name}`,
        payload: {},
      })
      return row
    })
    sendJson(res, 200, { id: session.id, code: session.code })
  })

  server.post('/api/sessions/random', async (req, res) => {
    const body = await parseBody(req, RandomSessionIn)
    const ch = await getCharacter(db, body.character_id)
    if (!ch) throw new HttpError(404, '没有这个节点')

    let cityId = body.city
    if (cityId && !content.data.world.cityById.has(cityId)) throw new HttpError(404, '没有这个城市')
    if (!cityId) cityId = pickCity(new Roller(newSeed()), content.data).id

    const mission = generate(content.data, cityId)
    const state = newState(content.data, cardOf(ch), mission.scenario)
    state.scenario = mission.scenario
    state.mission = {
      id: mission.id,
      name: mission.name,
      difficulty: mission.difficulty,
      reward: mission.reward,
      grade: mission.grade,
      city_name: mission.city_name,
    }

    const session = await db.transaction(async (tx) => {
      const row = await startRow(tx, mission.code, {
        character_id: ch.id,
        scenario_id: mission.id,
        status: 'active',
        state,
        seed: mission.seed,
      })
      await insertLog(tx, row.id, 1, {
        kind: 'scene',
        severity: 'info',
        text: `接入随机任务：${mission.name}｜难度 ${mission.difficulty}（${mission.grade}）｜报酬 ${mission.reward}`,
        payload: {},
      })
      return row
    })
    sendJson(res, 200, {
      id: session.id,
      code: session.code,
      mission_id: mission.id,
      name: mission.name,
      difficulty: mission.difficulty,
      reward: mission.reward,
    })
  })

  server.get('/api/sessions/:id', async (req, res) => {
    const session = await getSession(db, Number(req.params.id))
    if (!session) throw new HttpError(404, '没有这个处置会话')
    const ch = await getCharacter(db, session.character_id)
    if (!ch) throw new HttpError(404, '没有这个节点')
    const scenario = scenarioOf(content, session.state, session.scenario_id)
    const logs = await db.all('SELECT * FROM session_logs WHERE session_id = ? ORDER BY seq', [session.id])
    sendJson(res, 200, {
      id: session.id,
      code: session.code,
      status: session.status,
      character: { id: ch.id, code: ch.code, name: ch.name },
      scenario: { id: scenario.id, code: scenario.code, name: scenario.name },
      view: view(content.data, cardOf(ch), scenario, session.state),
      logs: logs.map((item: any) => ({ kind: item.kind, severity: item.severity, text: item.text })),
    })
  })

  server.post('/api/sessions/:id/act', async (req, res) => {
    const body = await parseBody(req, ActIn)
    const session = await getSession(db, Number(req.params.id))
    if (!session) throw new HttpError(404, '没有这个处置会话')
    const ch = await getCharacter(db, session.character_id)
    if (!ch) throw new HttpError(404, '没有这个节点')
    const scenario = scenarioOf(content, session.state, session.scenario_id)
    const payload = cardOf(ch)
    const wasDone = session.status === 'done'

    const [state, events] = act(content.data, payload, scenario, { ...session.state }, body.action)
    const status = state.status === 'done' ? 'done' : 'active'

    const ending = state.ending
    // 日志、角色结算、会话状态必须同一个事务：中途失败不能只记一半
    await db.transaction(async (tx) => {
      let seq = await nextLogSeq(tx, session.id)
      for (const item of events) {
        await insertLog(tx, session.id, seq++, item)
      }

      if (ending && !wasDone) {
        await updateCharacter(tx, ch.id, {
          merit: Number(ch.merit ?? 0) + Math.trunc(Number(ending.merit_award ?? 0)),
          completed_sessions: Number(ch.completed_sessions ?? 0) + 1,
          karma_good: Number(ch.karma_good ?? 0) + ending.karma.filter((item: string) => item === '善').length,
          karma_debt: Number(ch.karma_debt ?? 0) + ending.karma.filter((item: string) => item === '阴债').length,
        })
      }

      await updateSession(tx, session.id, { state, status })
    })
    sendJson(res, 200, {
      events,
      status,
      view: view(content.data, payload, scenario, state),
    })
  })
}

async function startRow(
  db: any,
  prefix: string,
  fields: { character_id: number; scenario_id: string; status: string; state: any; seed: string },
): Promise<{ id: number; code: string }> {
  const id = await insertSession(db, { code: `pending-${randomUUID().slice(0, 8)}`, ...fields })
  const code = `${prefix}-${String(id).padStart(3, '0')}`
  await updateSession(db, id, { code })
  return { id, code }
}

function scenarioOf(content: any, state: any, scenarioId: string): Scenario {
  const scenario = state?.scenario ?? content.data.scenarios.byId.get(scenarioId)
  if (!scenario) throw new HttpError(404, '这一局用的剧本已经不在了')
  return scenario
}
