/**
 * 内容装配。
 *
 * 职责：
 *     一次加载 10 个 JSON，并把每个文件转成「数组 + id 索引 + 纯函数」。
 * 为什么需要：
 *     插件启动时只做一次；reload 时整体替换，避免各模块各自读文件、各自缓存。
 * 上下游：
 *     上游：ContentStore；下游：plugins/content、core/*、api/*。
 */
import { ContentStore } from './store.ts'
import { indexBestiary, type BestiaryDoc, type BestiaryIndex } from './bestiary.ts'
import { indexEquipment, type EquipmentDoc, type EquipmentIndex } from './equipment.ts'
import { indexEvents, type EventsDoc, type EventsIndex } from './events.ts'
import { indexMissions, type MissionsDoc, type MissionsIndex } from './missions.ts'
import { indexScenarios, type Scenario, type ScenariosDoc, type ScenariosIndex } from './scenarios.ts'
import { indexShop, type ShopDoc, type ShopIndex } from './shop.ts'
import { indexSpirits, type SpiritsDoc, type SpiritsIndex } from './spirits.ts'
import { indexTalismans, type TalismansDoc, type TalismansIndex } from './talismans.ts'
import { indexTraits, type TraitsDoc, type TraitsIndex } from './traits.ts'
import { indexWorld, type WorldDoc, type WorldIndex } from './world.ts'

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

export interface GameContent {
  world: WorldIndex
  events: EventsIndex
  missions: MissionsIndex
  bestiary: BestiaryIndex
  equipment: EquipmentIndex
  traits: TraitsIndex
  talismans: TalismansIndex
  spirits: SpiritsIndex
  shop: ShopIndex
  scenarios: ScenariosIndex
}

export type ContentData = GameContent

export function loadContent(store: ContentStore): ContentData {
  return {
    world: indexWorld(store.load<WorldDoc>('world')),
    events: indexEvents(store.load<EventsDoc>('events')),
    missions: indexMissions(store.load<MissionsDoc>('missions')),
    bestiary: indexBestiary(store.load<BestiaryDoc>('bestiary')),
    equipment: indexEquipment(store.load<EquipmentDoc>('equipment')),
    traits: indexTraits(store.load<TraitsDoc>('traits')),
    talismans: indexTalismans(store.load<TalismansDoc>('talismans')),
    spirits: indexSpirits(store.load<SpiritsDoc>('spirits')),
    shop: indexShop(store.load<ShopDoc>('shop')),
    scenarios: indexScenarios(store.load<ScenariosDoc>('scenarios')),
  }
}

export type { Scenario }
