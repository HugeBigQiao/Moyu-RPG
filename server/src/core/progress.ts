/**
 * 成长线。
 *
 * 职责：
 *     授箓晋升、心魔试炼、功德商店结算。
 * 为什么需要：
 *     成长规则与人物状态强相关，集中一处才好平衡。
 * 上下游：
 *     上游：content/{spirits,shop,traits}、sheet；下游：api/characters。
 */
import type { GameContent } from '../content/index.ts'
import { RANKS } from '../content/spirits.ts'
import { resolve } from './checks.ts'
import { Roller } from './dice.ts'
import { pyRound } from './python.ts'
import { skillValue } from './sheet.ts'
import type { CharacterLike } from './types.ts'

const TRIAL_ROLLS = 3
const TRIAL_NEEDED = 2

function deps(content: GameContent) {
  return { traits: content.traits.traits, shop: content.shop }
}

export function nextRank(rank: string): string | null {
  const clean = (RANKS as readonly string[]).includes(rank) ? rank : '初真'
  const index = RANKS.indexOf(clean as (typeof RANKS)[number])
  if (index + 1 >= RANKS.length) return null
  return RANKS[index + 1]
}

function get(ch: CharacterLike, key: keyof CharacterLike, fallback: number = 0): number {
  const value = ch[key]
  return Number(value ?? 0) || fallback
}

export interface RequirementRow {
  key: string
  label: string
  have: number
  need: number
  unit: string
  ok: boolean
  pct: number
}

/** 下一级箓职的要求 + 当前进度。已经是天师则返回空。 */
export function requirements(ch: CharacterLike): RequirementRow[] {
  const nxt = nextRank(String(ch.rank ?? '初真'))
  if (!nxt) return []

  const sessions = get(ch, 'completed_sessions')
  const merit = get(ch, 'merit')
  const good = get(ch, 'karma_good')
  const trial = Boolean(ch.mind_trial_passed)

  let rows: Array<Omit<RequirementRow, 'ok' | 'pct'>>
  if (nxt === '盟威') {
    rows = [{ key: 'sessions', label: '完成驱祟任务', have: sessions, need: 3, unit: '次' }]
  } else if (nxt === '五雷') {
    rows = [
      { key: 'merit', label: '功德', have: merit, need: 50, unit: '' },
      { key: 'trial', label: '心魔试炼', have: trial ? 1 : 0, need: 1, unit: '' },
    ]
  } else {
    rows = [
      { key: 'merit', label: '功德', have: merit, need: 80, unit: '' },
      { key: 'karma', label: '善果', have: good, need: 3, unit: '件' },
      { key: 'sessions', label: '完成驱祟任务', have: sessions, need: 8, unit: '次' },
    ]
  }

  return rows.map((row) => ({
    ...row,
    ok: row.have >= row.need,
    pct: Math.min(100, pyRound((row.have * 100) / Math.max(1, row.need))),
  }))
}

export function promotable(ch: CharacterLike): boolean {
  const rows = requirements(ch)
  return rows.length > 0 && rows.every((row) => row.ok)
}

/** 晋升一级。返回新的箓职和为此新开的英灵认可度。 */
export function promote(content: GameContent, ch: CharacterLike) {
  if (!promotable(ch)) throw new Error('条件不够，晋不了。')
  const old = String(ch.rank ?? '初真')
  const next = nextRank(old)!
  ch.rank = next

  const approval = { ...(ch.approval ?? {}) }
  const opened: string[] = []
  for (const spirit of content.spirits.spirits) {
    if (spirit.rank === next && !(spirit.id in approval)) {
      approval[spirit.id] = 10
      opened.push(spirit.name)
    }
  }
  ch.approval = approval
  return { from: old, to: next, opened }
}

export interface TrialRow {
  roll: number
  target: number
  level: string
  success: boolean
}

/** 心魔试炼：三次精神抵抗，过两次。 */
export function trial(content: GameContent, card: CharacterLike, seed: string) {
  const roller = new Roller(seed)
  const target = skillValue(card, 'resist', deps(content))
  const rolls: TrialRow[] = []
  let passed = 0
  for (let i = 0; i < TRIAL_ROLLS; i++) {
    const result = resolve(roller, '精神抵抗', target, 0, '', `心魔试炼第 ${i + 1} 问`)
    rolls.push({ roll: result.roll, target: result.target, level: result.level, success: result.success })
    if (result.success) passed++
  }

  const ok = passed >= TRIAL_NEEDED
  return {
    passed: ok,
    passes: passed,
    need: TRIAL_NEEDED,
    rolls,
    text: ok
      ? '三问两渡。你听见有人在很远的地方叫你的名字，你没回头。'
      : '你在第二问上停住了。镜子里那个「你」比你更早抬起了头。',
  }
}

/** 买一件。原地改 ch（调用方负责落库）。 */
export function buy(content: GameContent, ch: CharacterLike, itemId: string) {
  const spec = content.shop.byId.get(itemId)
  if (!spec) throw new Error('货架上没有这件。')

  const items = (ch.items ?? []).map((item) => ({ ...item }))
  const entry = items.find((item) => item.id === itemId)
  const owned = entry ? Number(entry.qty ?? 0) : 0
  if (owned >= Number(spec.max_qty ?? 1)) throw new Error('这件你已经有了。')

  const need = spec.requires_rank as string | undefined
  if (need) {
    const rank = String(ch.rank ?? '初真')
    if (RANKS.indexOf(need as (typeof RANKS)[number]) > RANKS.indexOf(rank as (typeof RANKS)[number])) {
      throw new Error('箓职不够，买不了这件。')
    }
  }

  const price = Number(spec.price ?? 0)
  const merit = Number(ch.merit ?? 0)
  if (price > merit) throw new Error(`功德不够（差 ${price - merit}）。`)

  ch.merit = merit - price
  if (entry) entry.qty = owned + 1
  else items.push({ id: itemId, name: spec.name, qty: 1 })
  ch.items = items

  if (spec.effect?.karma_debt) {
    ch.karma_debt = Number(ch.karma_debt ?? 0) + Number(spec.effect.karma_debt)
  }

  return { item: spec.name, spent: price, left: ch.merit }
}

