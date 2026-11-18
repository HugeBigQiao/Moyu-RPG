/**
 * 符箓索引。
 *
 * 职责：
 *     读符箓表并建 id 索引。
 * 为什么需要：
 *     符箓是战斗里的主要道具，索引化让每次画符/引动都是 O(1)。
 * 上下游：
 *     上游：talismans.json；下游：session、api/characters。
 */

export interface Talisman {
  id: string
  name: string
  kind: string
  element: string
  draw_cost: number
  use_cost: number
  damage?: string
  scale?: string | null
  [key: string]: any
}

export interface TalismansDoc {
  talismans: Talisman[]
}

export interface TalismansIndex {
  talismans: Talisman[]
  byId: Map<string, Talisman>
}

export function indexTalismans(doc: TalismansDoc): TalismansIndex {
  const talismans = doc.talismans ?? []
  return { talismans, byId: new Map(talismans.map((item) => [item.id, item])) }
}
