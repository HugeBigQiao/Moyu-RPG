/**
 * 商店索引与角色加成合成。
 *
 * 职责：
 *     把 shop.json 索引成 id → 条目；把角色身上所有东西的加成合成一份。
 * 为什么需要：
 *     兑换与角色卡加成必须同源，否则「买完不生效」。
 * 上下游：
 *     上游：data/content/shop.json；下游：core/sheet、core/progress、plugins/content。
 */
import type { CharacterLike, ShopEffect, ShopItem } from '../core/types.ts'
import { RANKS } from './spirits.ts'

export interface ShopDoc {
  items: ShopItem[]
}

export interface ShopIndex {
  items: ShopItem[]
  byId: Map<string, ShopItem>
}

export interface ShopEffects {
  damage_vs: Record<string, number>
  damage_flat: number
  skill: Record<string, number>
  san_max: number
  draw_pool: number
  summon_discount: number
}

export function indexShop(doc: ShopDoc): ShopIndex {
  const items = doc.items ?? []
  return { items, byId: new Map(items.map((item) => [item.id, item])) }
}

export function getItem(index: ShopIndex, itemId: string): ShopItem | undefined {
  return index.byId.get(itemId)
}

/** 把角色身上所有东西的加成合成一份。纯函数，不依赖引擎。 */
export function effectsOf(character: CharacterLike, index: ShopIndex): ShopEffects {
  const out: ShopEffects = {
    damage_vs: {},
    damage_flat: 0,
    skill: {},
    san_max: 0,
    draw_pool: 0,
    summon_discount: 0,
  }
  for (const entry of character.items ?? []) {
    const spec = index.byId.get(entry.id ?? '')
    if (!spec) continue
    const qty = Math.trunc(Number(entry.qty ?? 1))
    const effect: ShopEffect = spec.effect ?? {}

    for (const [element, bonus] of Object.entries(effect.damage_vs ?? {})) {
      out.damage_vs[element] = (out.damage_vs[element] ?? 0) + bonus * qty
    }
    out.damage_flat += Math.trunc(Number(effect.damage_flat ?? 0)) * qty
    for (const [skillId, bonus] of Object.entries(effect.skill ?? {})) {
      out.skill[skillId] = (out.skill[skillId] ?? 0) + bonus * qty
    }
    out.san_max += Math.trunc(Number(effect.san_max ?? 0)) * qty
    out.draw_pool += Math.trunc(Number(effect.draw_pool ?? 0)) * qty
    out.summon_discount += Math.trunc(Number(effect.summon_discount ?? 0)) * qty
  }
  return out
}

/** 按箓职筛选货架；requires_rank 高于当前箓职的不可见。 */
export function visible(index: ShopIndex, rank: string): ShopItem[] {
  const clean = (RANKS as readonly string[]).includes(rank) ? rank : '初真'
  const limit = RANKS.indexOf(clean as (typeof RANKS)[number])
  return index.items.filter((item) => {
    const need = item.requires_rank as string | undefined
    return !need || RANKS.indexOf(need as (typeof RANKS)[number]) <= limit
  })
}
