/**
 * 引擎共用类型。
 *
 * 职责：
 *     描述角色卡、特性、商店条目这些跨模块的数据形状。
 * 为什么需要：
 *     Python 版靠鸭子类型；TS 需要一个最小契约来约束 core/content 的边界，
 *     但不能把内容字段写死成 zod（那是 content/schema.ts 的事）。
 * 上下游：
 *     上游：内容 JSON；下游：core/sheet、core/session、content/*。
 */

export interface CharacterTrait {
  name?: string
  desc?: string
  tier?: number
  [key: string]: unknown
}

export interface CharacterItem {
  id?: string
  qty?: number
  [key: string]: unknown
}

export interface CharacterLike {
  school?: string
  element?: string
  rank?: string
  merit?: number
  attrs?: Record<string, number>
  traits?: Array<string | CharacterTrait>
  items?: CharacterItem[]
  approval?: Record<string, number>
  karma_debt?: number
  skill_bonus?: Record<string, number>
  [key: string]: unknown
}

export interface TraitSpec {
  tier: number
  desc: string
  effect: Record<string, number>
  [key: string]: unknown
}

export interface ShopEffect {
  damage_vs?: Record<string, number>
  damage_flat?: number
  skill?: Record<string, number>
  san_max?: number
  draw_pool?: number
  summon_discount?: number
  karma_debt?: number
  [key: string]: any
}

export interface ShopItem {
  id: string
  name?: string
  effect?: ShopEffect
  [key: string]: unknown
}

export interface DerivedStats {
  hp_max: number
  mp_max: number
  san_max: number
  jianyi_max: number
  shaqi_max: number
  mp_source: string
  agility: number
  initiative: number
  rank_index: number
  can_summon: boolean
  summon_bonus: number
  merit: number
  karma_penalty: number
  karma_debt: number
  draw_pool: number
  summon_discount: number
  skills: Record<string, number>
}
