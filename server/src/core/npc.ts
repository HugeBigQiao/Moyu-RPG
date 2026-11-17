/**
 * 人物生成。
 *
 * 职责：
 *     随机人物（城市 × 事件 × 特性）与玩家自建（掷点 + 选事件）。
 * 为什么需要：
 *     人物是「世界长出来的」，生成规则同时决定属性、稀有度与难案倾向。
 * 上下游：
 *     上游：content/{world,events,traits,spirits,missions}、dice、sheet、gacha；下游：api/characters。
 */
import { createHash } from 'node:crypto'
import type { GameContent } from '../content/index.ts'
import { eventPool } from '../content/events.ts'
import { difficultyOf, gradeLabel, rewardOf } from '../content/missions.ts'
import { maxEvents, type City } from '../content/world.ts'
import { Roller, newSeed, roll4d6DropLowest } from './dice.ts'
import { RANKS, SCHOOLS } from './sheet.ts'
import { SCHOOL_FLOOR, SCHOOL_WEIGHTS, SURNAMES, GIVEN } from './gacha.ts'

export const ATTR_KEYS = ['str', 'agi', 'con', 'int', 'wil', 'per'] as const
export const ATTR_MIN = 6
export const ATTR_MAX = 18
export const PLAYER_POINTS = 72

export const TIER_ATTR_BONUS: Record<string, number> = { t0: 3, t1: 2, t2: 1, t3: 0, t4: -1 }
export const RANK_BY_RARITY: Record<string, string> = { 凡: '初真', 灵: '盟威', 玄: '五雷', 天: '天师' }
export const RARITY_BY_GRADE: Record<number, string> = { 1: '天', 2: '玄', 3: '灵', 4: '凡' }

function code(seed: string): string {
  return 'nd-' + createHash('md5').update(seed, 'utf8').digest('hex').slice(0, 6)
}

export interface NpcCard {
  kind: 'npc' | 'player'
  code: string
  name: string
  school: string
  element: string
  rarity: string
  rank: string
  merit: number
  attrs: Record<string, number>
  traits: Array<{ name: string; desc: string; tier: number }>
  approval: Record<string, number>
  notes: string
  seed: string
  city: string
  events: string[]
  mission: string | null
  difficulty: number
  reward: number
}

/** 按人口加权抽城市：越大的城市越容易出人。 */
export function pickCity(roller: Roller, content: GameContent, allowed?: string[] | null): City {
  let cities = content.world.cities
  if (allowed && allowed.length) {
    const filtered = cities.filter((city) => allowed.includes(city.id))
    if (filtered.length) cities = filtered
  }
  return roller.weighted(cities.map((city) => [city, Number(city.pop ?? 100)] as const), '出生城市')
}

/** 从可用事件池里不重复地抽 want 条。 */
export function pickEvents(
  roller: Roller,
  content: GameContent,
  city: City,
  missionId: string | null,
  want: number,
  allowedIds?: string[] | null,
  background = false,
) {
  let pool = eventPool(content.events, content.world, city, missionId, 4, background)
  if (allowedIds) pool = pool.filter(([event]) => allowedIds.includes(event.id))

  const chosen: typeof content.events.events = []
  while (pool.length && chosen.length < want) {
    const event = roller.weighted(pool, '事件')
    chosen.push(event)
    pool = pool.filter(([item]) => item.id !== event.id)
  }
  return chosen
}

/** 稀有度只看事件，但门槛收紧过。 */
export function rarityOf(chosen: Array<{ grade: number }>): string {
  const grades = chosen.map((event) => Number(event.grade))
  const top = grades.filter((grade) => grade === 1).length
  const second = grades.filter((grade) => grade === 2).length
  if (top >= 2) return '天'
  if (top === 1 || second >= 2) return '玄'
  if (grades.length >= 3 && Math.min(...grades) <= 3) return '灵'
  return '凡'
}

/** 玩家属性：4d6↓ 掷六次，再用「随机自由点」补到 72。 */
export function rollPlayerAttrs(seed?: string): { attrs: Record<string, number>; total: number; seed: string } {
  seed = seed || newSeed()
  const roller = new Roller(seed)
  const attrs: Record<string, number> = {}
  for (const key of ATTR_KEYS) {
    attrs[key] = Math.max(ATTR_MIN, Math.min(ATTR_MAX, roll4d6DropLowest(roller)))
  }

  let guard = 0
  while (Object.values(attrs).reduce((a, b) => a + b, 0) !== PLAYER_POINTS && guard < 1000) {
    guard++
    const total = Object.values(attrs).reduce((a, b) => a + b, 0)
    if (total < PLAYER_POINTS) {
      const pool = ATTR_KEYS.filter((key) => attrs[key] < ATTR_MAX)
      if (!pool.length) break
      attrs[roller.choice(pool, '补点')] += 1
    } else {
      const pool = ATTR_KEYS.filter((key) => attrs[key] > ATTR_MIN)
      if (!pool.length) break
      attrs[roller.choice(pool, '扣点')] -= 1
    }
  }

  return { attrs, total: Object.values(attrs).reduce((a, b) => a + b, 0), seed }
}

export function traitsOf(content: GameContent, events: Array<{ traits?: string[] }>, cap = 4) {
  const names: string[] = []
  for (const event of events) {
    for (const name of event.traits ?? []) {
      if (content.traits.traits[name] && !names.includes(name)) names.push(name)
    }
  }
  return names.slice(0, cap).map((name) => ({
    name,
    desc: content.traits.traits[name].desc,
    tier: content.traits.traits[name].tier,
  }))
}

export function evaluate(content: GameContent, city: City, chosen: Array<{ grade: number }>, monsterHp = 0) {
  const difficulty = difficultyOf(chosen, monsterHp, city.tier)
  return {
    difficulty,
    grade: gradeLabel(difficulty),
    reward: rewardOf(difficulty),
    event_count: chosen.length,
    max_events: maxEvents(content.world, city.id),
  }
}

/** 随机生成一个人物（NPC）。 */
export function rollNpc(
  content: GameContent,
  options: { cityId?: string | null; missionId?: string | null; seed?: string } = {},
): NpcCard {
  const seed = options.seed || newSeed()
  const roller = new Roller(seed)

  const city = options.cityId
    ? content.world.cityById.get(options.cityId) ?? content.world.cities[0]
    : pickCity(roller, content)
  const ceiling = maxEvents(content.world, city.id)
  const want = roller.randint(1, ceiling)
  let chosen = pickEvents(roller, content, city, options.missionId ?? null, want, null, true)
  if (!chosen.length) {
    chosen = pickEvents(roller, content, content.world.cityById.get('nanyu') ?? content.world.cities[0], null, 1)
  }

  const school = roller.weighted(Object.entries(SCHOOL_WEIGHTS), '流派')
  const element = roller.choice(['金', '木', '水', '火', '土'], '本命五行')

  const bonus = TIER_ATTR_BONUS[city.tier] ?? 0
  const attrs: Record<string, number> = {}
  for (const key of ATTR_KEYS) {
    attrs[key] = Math.max(3, Math.min(20, roll4d6DropLowest(roller) + bonus))
  }
  for (const [key, floor] of Object.entries(SCHOOL_FLOOR[school])) {
    attrs[key] = Math.max(attrs[key], floor + Math.max(0, bonus))
  }

  const rarity = rarityOf(chosen)
  const rank = RANK_BY_RARITY[rarity]

  const approval: Record<string, number> = {}
  if (rank !== '初真') {
    const limit = RANKS.indexOf(rank as (typeof RANKS)[number])
    for (const spirit of content.spirits.spirits) {
      if (RANKS.indexOf(spirit.rank as (typeof RANKS)[number]) <= limit) {
        approval[spirit.id] = roller.randint(5, 45)
      }
    }
  }

  const name = roller.choice(Array.from(SURNAMES)) + roller.choice(GIVEN)
  const notes = chosen[0]?.hook ?? '档案缺页。'
  const evaluated = evaluate(content, city, chosen)

  return {
    kind: 'npc',
    code: code(seed),
    name,
    school,
    element,
    rarity,
    rank,
    merit: roller.randint(0, 30),
    attrs,
    traits: traitsOf(content, chosen),
    approval,
    notes,
    seed,
    city: city.id,
    events: chosen.map((event) => event.id),
    mission: options.missionId ?? null,
    difficulty: evaluated.difficulty,
    reward: evaluated.reward,
  }
}

export function validateAttrs(attrs: Record<string, number>): string[] {
  const problems: string[] = []
  for (const key of ATTR_KEYS) {
    const value = Number(attrs[key] ?? 0)
    if (value < ATTR_MIN || value > ATTR_MAX) problems.push(`${key} 必须在 ${ATTR_MIN}–${ATTR_MAX} 之间`)
  }
  const total = ATTR_KEYS.reduce((sum, key) => sum + Number(attrs[key] ?? 0), 0)
  if (total !== PLAYER_POINTS) problems.push(`属性总和必须是 ${PLAYER_POINTS}，现在是 ${total}`)
  return problems
}

export interface PlayerPayload {
  name?: string
  school?: string
  element?: string
  city?: string
  attrs?: Record<string, number>
  events?: string[]
  notes?: string
}

/** 玩家自建角色。payload 已经由接口层校验过类型。 */
export function buildPlayer(content: GameContent, payload: PlayerPayload, seed?: string): NpcCard {
  seed = seed || newSeed()
  const roller = new Roller(seed)

  const cityId = payload.city || 'nanyu'
  const city = content.world.cityById.get(cityId)
  if (!city) throw new Error(`没有这个城市：${cityId}`)

  const school = payload.school
  if (!school || !SCHOOLS[school]) throw new Error(`没有这个流派：${school}`)
  const element = payload.element
  if (!element || !['金', '木', '水', '火', '土'].includes(element)) throw new Error('本命五行不合法')

  let attrs: Record<string, number>
  if (payload.attrs) {
    attrs = Object.fromEntries(ATTR_KEYS.map((key) => [key, Number(payload.attrs?.[key] ?? 10)]))
  } else {
    attrs = rollPlayerAttrs(seed).attrs
  }
  const problems = validateAttrs(attrs)
  if (problems.length) throw new Error(problems.join('；'))
  attrs = Object.fromEntries(Object.entries(attrs).map(([key, value]) => [key, Math.trunc(value)]))

  const wanted = payload.events ?? []
  const chosen = pickEvents(roller, content, city, null, wanted.length, wanted)
  if (chosen.length < wanted.length) {
    throw new Error(`有事件不适合这座城市：选了 ${wanted.length} 条，只有 ${chosen.length} 条可用`)
  }

  const evaluated = evaluate(content, city, chosen)
  return {
    kind: 'player',
    code: code(seed),
    name: (payload.name || '无名').trim().slice(0, 16),
    school,
    element,
    rarity: '凡',
    rank: '初真',
    merit: 20,
    attrs,
    traits: traitsOf(content, chosen),
    approval: {},
    notes: (payload.notes || '').trim().slice(0, 200) || '玩家自建档案。',
    seed,
    city: city.id,
    events: chosen.map((event) => event.id),
    mission: null,
    difficulty: evaluated.difficulty,
    reward: evaluated.reward,
  }
}
