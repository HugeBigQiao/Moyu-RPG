/**
 * 英灵索引与认可度换算。
 *
 * 职责：
 *     按箓职筛选可请英灵，认可度折算请神消耗与继承比例。
 * 为什么需要：
 *     授箓与请神共用一套数，否则「晋升后反而变贵」。
 * 上下游：
 *     上游：spirits.json；下游：session、progress、api/characters。
 */
import { pyRound } from '../core/python.ts'

export const RANKS = ['初真', '盟威', '五雷', '天师'] as const

export interface Spirit {
  id: string
  name: string
  title?: string
  element?: string
  rank: string
  cost: number
  panel: Record<string, number>
  [key: string]: any
}

export interface SpiritsDoc {
  spirits: Spirit[]
}

export interface SpiritsIndex {
  spirits: Spirit[]
  byId: Map<string, Spirit>
}

export function indexSpirits(doc: SpiritsDoc): SpiritsIndex {
  const spirits = doc.spirits ?? []
  return { spirits, byId: new Map(spirits.map((item) => [item.id, item])) }
}

/** 当前箓职能请到的英灵。 */
export function available(index: SpiritsIndex, rank: string): Spirit[] {
  const clean = (RANKS as readonly string[]).includes(rank) ? rank : '初真'
  const limit = RANKS.indexOf(clean as (typeof RANKS)[number])
  return index.spirits.filter((spirit) => RANKS.indexOf(spirit.rank as (typeof RANKS)[number]) <= limit)
}

export function getSpirit(index: SpiritsIndex, spiritId: string): Spirit | undefined {
  return index.byId.get(spiritId)
}

/** 认可度每 20 点减 10% 灵力消耗。 */
export function approvalCost(spirit: Spirit, approval: number): number {
  const base = Number(spirit.cost)
  return Math.max(1, pyRound(base * (1 - Math.trunc(approval / 20) * 0.1)))
}

/** 能力继承比例：认可度 0 时四成，满认可度时满值。 */
export function inheritRatio(approval: number): number {
  return 0.4 + (0.6 * Math.max(0, Math.min(100, approval))) / 100.0
}
