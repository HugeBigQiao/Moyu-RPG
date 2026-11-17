/**
 * 特性索引。
 *
 * 职责：
 *     把 traits.json 变成「名字 → 特性规格」的查表，供 sheet 计算加成。
 * 为什么需要：
 *     热重载后必须整体替换索引，不能抱着旧 dict；索引化也让查询是 O(1)。
 * 上下游：
 *     上游：data/content/traits.json；下游：core/sheet、plugins/content。
 */
import type { TraitSpec } from '../core/types.ts'

export interface TraitsDoc {
  tiers: Record<string, unknown>
  traits: Record<string, TraitSpec>
}

export interface TraitsIndex {
  tiers: Record<number, unknown>
  traits: Record<string, TraitSpec>
  nameById: Record<string, string>
}

export function indexTraits(doc: TraitsDoc): TraitsIndex {
  const tiers: Record<number, unknown> = {}
  for (const [key, value] of Object.entries(doc.tiers ?? {})) {
    tiers[Number(key)] = value
  }
  return {
    tiers,
    traits: doc.traits ?? {},
    nameById: Object.fromEntries(Object.keys(doc.traits ?? {}).map((name) => [name, name])),
  }
}
