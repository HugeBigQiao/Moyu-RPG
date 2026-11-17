/**
 * 游戏页接口。
 *
 * 职责：
 *     总览、地图、城市面板三块数据。
 * 为什么需要：
 *     这三块共享「城市 → 任务/人物/势力」的组装逻辑，放一起避免重复查询。
 * 上下游：
 *     上游：content、db、core/mission；下游：前端 GameView。
 */
import type { Context } from 'cordis'
import { preview } from '../core/mission.ts'
import { pyRound } from '../core/python.ts'
import { stamp } from '../db/client.ts'
import { listCharacters, rowToCharacter, rowToSession } from '../db/repo.ts'
import { HttpError, sendJson } from '../plugins/http.ts'
import { brief, cityPayload } from './common.ts'

export function registerGame(ctx: Context): void {
  const content = ctx.content
  const db = ctx.db
  const rules = ctx.rules
  const server = ctx.server

  server.get('/api/dashboard', async (_req, res) => {
    const chars = await listCharacters(db, 6, 'id DESC')
    const sessions = (await db.all('SELECT * FROM sessions ORDER BY id DESC LIMIT 8')).map(rowToSession)
    const characters = await listCharacters(db)
    const names = new Map(characters.map((row) => [row.id, row.name]))
    const scenarioNames = new Map(content.data.scenarios.scenarios.map((item) => [item.id, item.name]))

    const totalChars = Number((await db.get('SELECT COUNT(*) AS n FROM characters'))?.n ?? 0)
    const totalSessions = Number((await db.get('SELECT COUNT(*) AS n FROM sessions'))?.n ?? 0)
    const active = Number((await db.get("SELECT COUNT(*) AS n FROM sessions WHERE status = 'active'"))?.n ?? 0)
    const loads = sessions.filter((item) => item.status === 'active').map((item) => Math.trunc(Number(item.state?.corruption ?? 0)))
    const avgLoad = loads.length ? pyRound(loads.reduce((a, b) => a + b, 0) / loads.length) : 0

    const byRarity: Record<string, number> = {}
    for (const [key, name] of [['凡', '凡品'], ['灵', '灵品'], ['玄', '玄品'], ['天', '天品']]) {
      const row = await db.get('SELECT COUNT(*) AS n FROM characters WHERE rarity = ?', [key])
      byRarity[name] = Number(row?.n ?? 0)
    }

    const logs = await db.all('SELECT * FROM session_logs ORDER BY id DESC LIMIT 10')

    sendJson(res, 200, {
      totals: { characters: totalChars, sessions: totalSessions, active, avg_load: avgLoad },
      by_rarity: byRarity,
      recent_chars: chars.map((row) => brief(content.data, rules, row)),
      recent_sessions: sessions.map((item) => ({
        id: item.id,
        code: item.code,
        character_id: item.character_id,
        character_name: names.get(item.character_id) ?? '?',
        scenario_name: scenarioNames.get(item.scenario_id) ?? item.scenario_id,
        status: item.status,
        corruption: Math.trunc(Number(item.state?.corruption ?? 0)),
        created_at: stamp(item.created_at),
      })),
      logs: logs.map((item) => ({
        seq: item.seq,
        kind: item.kind,
        severity: item.severity,
        text: item.text,
      })),
    })
  })

  server.get('/api/game/map', async (_req, res) => {
    const rows = await db.all('SELECT city, COUNT(*) AS n FROM characters GROUP BY city')
    const people = new Map(rows.map((row) => [row.city, Number(row.n)]))
    const cities = content.data.world.cities.map((city) => {
      const [lat, lon] = geoOfCity(content.data, city.id)
      const fixed = content.data.missions.missions.filter((item) => (item.cities ?? []).includes(city.id))
      return {
        id: city.id,
        name: city.name,
        tier: city.tier,
        tier_name: content.data.world.tierByKey.get(city.tier)?.name ?? city.tier,
        nation: city.nation,
        lat,
        lon,
        people: people.get(city.id) ?? 0,
        missions: fixed.length,
        factions: (content.data.world.cityFactions[city.id] ?? []).length,
      }
    })
    sendJson(res, 200, { cities })
  })

  server.get('/api/game/city/:id', async (req, res) => {
    const cityId = req.params.id
    const city = content.data.world.cityById.get(cityId)
    if (!city) throw new HttpError(404, '没有这个城市')

    const rows = await db.all(
      'SELECT * FROM characters WHERE city = ? ORDER BY difficulty DESC LIMIT 8', [cityId],
    )
    const fixed = content.data.missions.missions.filter((item) => (item.cities ?? []).includes(cityId))
    sendJson(res, 200, {
      city: cityPayload(content.data, city),
      missions: fixed,
      random_missions: preview(content.data, cityId, 3),
      people: rows.map((row) => brief(content.data, rules, rowToCharacter(row))),
      factions: content.data.world.cityFactions[cityId] ?? [],
    })
  })
}

function geoOfCity(content: any, cityId: string): [number, number] {
  const point = content.world.cityGeo[cityId] ?? [35.0, 105.0]
  return [Number(point[0]), Number(point[1])]
}
