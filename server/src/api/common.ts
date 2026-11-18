/**
 * 接口层公用工具。
 *
 * 职责：
 *     人物摘要、城市视图与请求体解析。
 * 为什么需要：
 *     这些转换被多个 router 复用，放一处避免口径不一致。
 * 上下游：
 *     上游：db/repo、content、core/sheet；下游：api/*。
 */
import type { ContentData } from '../content/index.ts'
import { factionsOf, geoOf, industryName, maxEvents, type City } from '../content/world.ts'
import type { CharacterRow } from '../db/repo.ts'
import { cardOf } from '../db/repo.ts'
import { SCHOOLS } from '../core/sheet.ts'
import type { Rules } from '../plugins/rules.ts'
import type { HttpRequest } from '../plugins/http.ts'
import type { z } from 'zod'

export function brief(content: ContentData, rules: Rules, ch: CharacterRow) {
  const stats = rules.derived(cardOf(ch))
  const city = content.world.cityById.get(ch.city)
  return {
    id: ch.id,
    code: ch.code,
    name: ch.name,
    school: ch.school,
    school_name: SCHOOLS[ch.school]?.name ?? ch.school,
    element: ch.element,
    rarity: ch.rarity,
    rank: ch.rank,
    merit: ch.merit,
    kind: ch.kind || 'npc',
    city: ch.city,
    city_name: city?.name ?? ch.city,
    city_tier: city?.tier ?? '',
    events: ch.events ?? [],
    difficulty: ch.difficulty || 1,
    reward: ch.reward || 5,
    stats: {
      hp_max: stats.hp_max,
      mp_max: stats.mp_max,
      san_max: stats.san_max,
    },
  }
}

export function cityPayload(content: ContentData, city: City) {
  const world = content.world
  const [lat, lon] = geoOf(world, city.id)
  return {
    ...city,
    lat,
    lon,
    tier_name: world.tierByKey.get(city.tier)?.name ?? city.tier,
    max_events: maxEvents(world, city.id),
    industry_names: (city.industries ?? []).map((id) => industryName(world, id)),
    nation_name: world.nationById.get(city.nation)?.name ?? city.nation,
    factions: factionsOf(world, city.id),
  }
}

/** 解析 JSON 请求体；zod 失败会抛出 issues，由 HTTP 层转成 400。 */
export async function parseBody<T extends z.ZodTypeAny>(
  req: HttpRequest,
  schema: T,
): Promise<z.infer<T>> {
  const body = await req.json()
  return schema.parse(body)
}
