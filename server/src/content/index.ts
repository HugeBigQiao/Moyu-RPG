/**
 * 内容装配。
 *
 * 职责：
 *     一次加载 10 个 JSON，并把需要索引的文件（traits/shop）转成查表结构。
 * 为什么需要：
 *     插件启动时只做一次；reload 时再整体替换，避免每个模块各自读文件。
 * 上下游：
 *     上游：ContentStore；下游：plugins/content、core/sheet、core/session。
 */
import { ContentStore } from './store.ts'
import { indexShop, type ShopDoc, type ShopIndex } from './shop.ts'
import { indexTraits, type TraitsDoc, type TraitsIndex } from './traits.ts'

/** 尚未建模的内容文档：P3 会换成 zod 模型的输出。 */
export type Doc = Record<string, any>

export const CONTENT_FILES = [
  'world',
  'events',
  'missions',
  'bestiary',
  'equipment',
  'traits',
  'talismans',
  'spirits',
  'shop',
  'scenarios',
] as const

export interface ContentData {
  world: Doc
  events: Doc
  missions: Doc
  bestiary: Doc
  equipment: Doc
  traits: TraitsIndex
  talismans: Doc
  spirits: Doc
  shop: ShopIndex
  scenarios: Doc
}

export function loadContent(store: ContentStore): ContentData {
  return {
    world: store.load<Doc>('world'),
    events: store.load<Doc>('events'),
    missions: store.load<Doc>('missions'),
    bestiary: store.load<Doc>('bestiary'),
    equipment: store.load<Doc>('equipment'),
    traits: indexTraits(store.load<TraitsDoc>('traits')),
    talismans: store.load<Doc>('talismans'),
    spirits: store.load<Doc>('spirits'),
    shop: indexShop(store.load<ShopDoc>('shop')),
    scenarios: store.load<Doc>('scenarios'),
  }
}
