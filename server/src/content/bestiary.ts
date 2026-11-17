/**
 * 祟物索引与形态规则。
 *
 * 职责：
 *     按剩余血量百分比选形态，按形态算伤害门槛。
 * 为什么需要：
 *     三态规则（灵体/附身/实体）决定「什么打得动它」，是战斗核心约束。
 * 上下游：
 *     上游：bestiary.json；下游：session、mission。
 */

export interface MonsterPhase {
  state: string
  label: string
  attack: {
    name: string
    type: string
    dice: string
    text?: string
    san?: string
    [key: string]: any
  }
  [key: string]: any
}

export interface Monster {
  id: string
  name: string
  element: string
  hp: number
  corruption?: number
  lore: string
  weakness?: string[]
  phases: MonsterPhase[]
  [key: string]: any
}

export interface BestiaryDoc {
  bestiary: Monster[]
}

export interface BestiaryIndex {
  bestiary: Monster[]
  byId: Map<string, Monster>
}

export function indexBestiary(doc: BestiaryDoc): BestiaryIndex {
  const bestiary = doc.bestiary ?? []
  return { bestiary, byId: new Map(bestiary.map((item) => [item.id, item])) }
}

export function getMonster(index: BestiaryIndex, monsterId: string): Monster | undefined {
  return index.byId.get(monsterId)
}

/** 当前是第几形态（0 起）。 */
export function phaseIndex(monster: Monster, hp: number): number {
  const phases = monster.phases
  if (phases.length <= 1) return 0
  const ratio = hp / Math.max(1, Number(monster.hp))
  if (phases.length === 2) return ratio > 0.45 ? 0 : 1
  if (ratio > 0.6) return 0
  if (ratio > 0.3) return 1
  return 2
}

export function phaseFor(monster: Monster, hp: number): MonsterPhase {
  return monster.phases[phaseIndex(monster, hp)]
}

const GATE: Record<string, Record<string, number>> = {
  灵体: { physical: 0.0, spell: 1.0, talisman: 1.0 },
  附身: { physical: 0.5, spell: 1.0, talisman: 1.0 },
  实体: { physical: 1.0, spell: 1.0, talisman: 1.0 },
}

/** 某个形态下这种伤害吃几成。 */
export function stateGate(state: string, damageType: string): number {
  return GATE[state]?.[damageType] ?? 1.0
}
