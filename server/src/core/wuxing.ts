/**
 * 五行生克。
 *
 * 职责：
 *     属性关系、伤害倍率、检定修正的纯函数。
 * 为什么需要：
 *     克制关系只有一份定义，否则伤害与检定会各算各的。
 * 上下游：
 *     上游：无；下游：checks、session、npc。
 */

export const ELEMENTS = ['金', '木', '水', '火', '土'] as const
export type Element = string | null | undefined

export const KE: Record<string, string> = { 金: '木', 木: '土', 土: '水', 水: '火', 火: '金' }
export const SHENG: Record<string, string> = { 金: '水', 水: '木', 木: '火', 火: '土', 土: '金' }
export const SHA = '煞'

export type Relation = '克' | '被克' | '同源' | '无涉' | '煞'

export function isSha(element: Element): boolean {
  return element === SHA
}

export function relation(attacker: Element, defender: Element): Relation {
  if (isSha(attacker)) return '煞'
  if (!attacker || !defender) return '无涉'
  if (attacker === defender) return '同源'
  if (KE[attacker] === defender) return '克'
  if (KE[defender] === attacker) return '被克'
  return '无涉'
}

export function multiplier(attacker: Element, defender: Element): number {
  const rel = relation(attacker, defender)
  if (rel === '克') return 1.5
  if (rel === '被克') return 0.5
  if (rel === '煞') return 1.25
  return 1.0
}

export function produces(attacker: Element, defender: Element): boolean {
  if (!attacker || !defender || isSha(attacker) || isSha(defender)) return false
  return SHENG[attacker] === defender
}

export function checkModifier(attacker: Element, defender: Element): number {
  const rel = relation(attacker, defender)
  return { 克: 20, 被克: -20, 同源: 5, 煞: 10, 无涉: 0 }[rel]
}

export function describe(attacker: Element, defender: Element): string {
  const rel = relation(attacker, defender)
  if (rel === '克') return `${attacker}克${defender}，伤害 ×1.5，检定 +20`
  if (rel === '被克') return `${attacker}受${defender}所制，伤害 ×0.5，检定 −20`
  if (rel === '同源') return `${attacker}同源，抵抗更强，检定仅 +5`
  if (rel === '煞') return '阴煞之力不循生克，伤害 ×1.25，检定 +10'
  return `${attacker}与${defender}无涉，一切照常`
}
