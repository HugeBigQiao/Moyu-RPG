/**
 * 人物接口。
 *
 * 职责：
 *     名录、随机生成、玩家自建、角色卡详情、授箓/试炼/兑换。
 * 为什么需要：
 *     人物是全项目最复杂的聚合（属性、事件、英灵、商店都挂在上面），单独成模块。
 * 上下游：
 *     上游：core/{npc,gacha,progress,sheet}、content；下游：前端人物页。
 */
import type { Context } from 'cordis'
import { rateTable, rollMany } from '../core/gacha.ts'
import { buildPlayer, rollNpc, rollPlayerAttrs } from '../core/npc.ts'
import { buy, promote, requirements, trial, nextRank } from '../core/progress.ts'
import { RANKS, SKILLS } from '../core/sheet.ts'
import { HttpError, sendJson } from '../plugins/http.ts'
import { cardOf, getCharacter, insertCharacter, listCharacters, rowToSession, updateCharacter } from '../db/repo.ts'
import { visible } from '../content/shop.ts'
import { brief, parseBody } from './common.ts'
import { BuyIn, GachaIn, NpcIn, PlayerIn } from './schemas.ts'

export function registerCharacters(ctx: Context): void {
  const content = ctx.content
  const db = ctx.db
  const rules = ctx.rules
  const server = ctx.server

  server.get('/api/roster', async (_req, res) => {
    const rows = await listCharacters(db, undefined, 'id DESC')
    sendJson(res, 200, { rows: rows.map((row) => brief(content.data, rules, row)), rate: rateTable() })
  })

  server.post('/api/npcs', async (req, res) => {
    const body = await parseBody(req, NpcIn)
    const count = Math.max(1, Math.min(10, body.count))
    const ids: number[] = []
    await db.transaction(async (tx) => {
      for (let i = 0; i < count; i++) {
        const built = rollNpc(content.data, {
          cityId: body.city ?? null,
          missionId: body.mission ?? null,
        })
        ids.push(await insertCharacter(tx, built))
      }
    })
    const people = []
    for (const id of ids) {
      const row = await getCharacter(db, id)
      if (row) people.push(brief(content.data, rules, row))
    }
    sendJson(res, 200, { created: people.length, people })
  })

  server.post('/api/characters/roll', (_req, res) => {
    sendJson(res, 200, rollPlayerAttrs())
  })

  server.post('/api/characters', async (req, res) => {
    const body = await parseBody(req, PlayerIn)
    let built
    try {
      built = buildPlayer(content.data, body)
    } catch (error) {
      throw new HttpError(400, (error as Error).message)
    }
    const id = await insertCharacter(db, built)
    const row = await getCharacter(db, id)
    sendJson(res, 200, { id, code: built.code, brief: row ? brief(content.data, rules, row) : null })
  })

  server.post('/api/gacha', async (req, res) => {
    const body = await parseBody(req, GachaIn)
    const count = Math.max(1, Math.min(10, body.count))
    const cards = []
    for (const built of rollMany(content.data, count)) {
      await insertCharacter(db, {
        ...built,
        kind: 'npc',
        city: 'nanyu',
        events: [],
        mission: null,
        difficulty: 1,
        reward: 5,
      })
      cards.push({
        code: built.code,
        name: built.name,
        school: built.school,
        element: built.element,
        rarity: built.rarity,
        rank: built.rank,
      })
    }
    sendJson(res, 200, { created: cards.length, cards })
  })

  server.delete('/api/characters/:id', async (req, res) => {
    const id = Number(req.params.id)
    const row = await getCharacter(db, id)
    if (!row) throw new HttpError(404, '没有这个节点')
    await db.run('DELETE FROM characters WHERE id = ?', [id])
    sendJson(res, 200, { ok: true })
  })

  server.get('/api/characters/:id', async (req, res) => {
    const id = Number(req.params.id)
    const ch = await getCharacter(db, id)
    if (!ch) throw new HttpError(404, '没有这个节点')

    const payload = cardOf(ch)
    const stats = rules.derived(payload)
    const scenarioNames = new Map(content.data.scenarios.scenarios.map((item) => [item.id, item.name]))
    const sessionRows = (await db.all('SELECT * FROM sessions WHERE character_id = ? ORDER BY id DESC', [id]))
      .map(rowToSession)
    const owned = new Map((ch.items ?? []).map((item: any) => [item.id, Number(item.qty ?? 1)]))
    const city = content.data.world.cityById.get(ch.city)

    const shelf = visible(content.data.shop, ch.rank).map((item) => ({
      ...item,
      owned: owned.get(item.id) ?? 0,
      afford: Number(ch.merit) >= Number(item.price ?? 0),
      full: (owned.get(item.id) ?? 0) >= Number(item.max_qty ?? 1),
      corrupt: Boolean(item.corrupt),
    }))

    sendJson(res, 200, {
      id: ch.id,
      code: ch.code,
      name: ch.name,
      kind: ch.kind || 'npc',
      city: {
        id: ch.city,
        name: city?.name ?? ch.city,
        tier: city?.tier ?? '',
        tier_name: city ? content.data.world.tierByKey.get(city.tier)?.name ?? '' : '',
      },
      events: (ch.events ?? [])
        .map((eventId) => content.data.events.byId.get(eventId))
        .filter(Boolean)
        .map((event: any) => ({
          id: event.id,
          name: event.name,
          grade: event.grade,
          grade_name: content.data.events.grades[event.grade]?.name ?? '?',
          text: event.text,
          hook: event.hook,
          traits: event.traits ?? [],
        })),
      difficulty: ch.difficulty,
      reward: ch.reward,
      school: ch.school,
      school_name: rules.schoolName(ch.school),
      tagline: rules.schoolTagline(ch.school),
      element: ch.element,
      rarity: ch.rarity,
      rank: ch.rank,
      merit: ch.merit,
      karma_debt: ch.karma_debt ?? 0,
      completed_sessions: ch.completed_sessions ?? 0,
      notes: ch.notes,
      seed: ch.seed,
      attrs: rules.displayAttrs(payload),
      skills: Object.entries(SKILLS).map(([id, [name]]) => ({ id, name, value: stats.skills[id] })),
      stats,
      traits: ch.traits ?? [],
      items: ch.items ?? [],
      ascensions: ch.ascensions ?? [],
      spirits: content.data.spirits.spirits
        .filter((spirit) => RANKS.indexOf(spirit.rank as (typeof RANKS)[number]) <= RANKS.indexOf(ch.rank as (typeof RANKS)[number]))
        .map((spirit) => ({
          id: spirit.id,
          name: spirit.name,
          title: spirit.title,
          element: spirit.element,
          rank: spirit.rank,
          cost: spirit.cost,
          approval: Number(ch.approval?.[spirit.id] ?? 0),
        })),
      missions: content.data.scenarios.scenarios.map((scenario) => ({
        id: scenario.id,
        code: scenario.code,
        name: scenario.name,
        brief: scenario.brief,
      })),
      sessions: sessionRows.map((session) => ({
        id: session.id,
        code: session.code,
        status: session.status,
        scenario_name: scenarioNames.get(session.scenario_id) ?? session.scenario_id,
        corruption: Math.trunc(Number(session.state?.corruption ?? 0)),
      })),
      progress: {
        next_rank: nextRank(ch.rank),
        promotable: requirements(payload).length > 0 && requirements(payload).every((row) => row.ok),
        reqs: requirements(payload),
        trial_attempts: ch.trial_attempts ?? 0,
        trial_passed: Boolean(ch.mind_trial_passed),
      },
      shelf,
    })
  })

  server.post('/api/characters/:id/promote', async (req, res) => {
    const id = Number(req.params.id)
    const ch = await getCharacter(db, id)
    if (!ch) throw new HttpError(404, '没有这个节点')
    const payload = cardOf(ch)
    let result
    try {
      result = promote(content.data, payload)
    } catch (error) {
      throw new HttpError(400, (error as Error).message)
    }
    const ascensions = [...(ch.ascensions ?? []), {
      from: result.from,
      to: result.to,
      opened: result.opened,
      at: localSecondStamp(),
    }]
    await updateCharacter(db, id, {
      rank: result.to,
      approval: payload.approval ?? {},
      ascensions,
    })
    sendJson(res, 200, { ok: true, ...result })
  })

  server.post('/api/characters/:id/trial', async (req, res) => {
    const id = Number(req.params.id)
    const ch = await getCharacter(db, id)
    if (!ch) throw new HttpError(404, '没有这个节点')
    const attempt = (ch.trial_attempts ?? 0) + 1
    const result = trial(content.data, cardOf(ch), `trial-${id}-${attempt}`)
    await updateCharacter(db, id, {
      trial_attempts: attempt,
      mind_trial_passed: result.passed ? 1 : (ch.mind_trial_passed ? 1 : 0),
    })
    sendJson(res, 200, { ok: true, ...result })
  })

  server.post('/api/characters/:id/buy', async (req, res) => {
    const id = Number(req.params.id)
    const body = await parseBody(req, BuyIn)
    const ch = await getCharacter(db, id)
    if (!ch) throw new HttpError(404, '没有这个节点')
    const payload = cardOf(ch)
    let result
    try {
      result = buy(content.data, payload, body.item_id)
    } catch (error) {
      throw new HttpError(400, (error as Error).message)
    }
    await updateCharacter(db, id, {
      merit: payload.merit,
      items: payload.items ?? [],
      karma_debt: payload.karma_debt ?? ch.karma_debt,
    })
    sendJson(res, 200, { ok: true, ...result })
  })
}

function localSecondStamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
