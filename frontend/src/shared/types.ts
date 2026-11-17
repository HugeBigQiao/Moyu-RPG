/**
 * 接口与内容的类型定义。
 *
 * 职责：
 *     给前端一份「后端返回什么」的类型约定：世界层、事件、任务、装备、特性、
 *     角色卡、会话视图，以及档案编辑用到的条目类型。
 * 为什么需要：
 *     JS 里字段拼错只有运行时才报；这些类型在编辑器和 vue-tsc 里就能挡住
 *     `item.city_names` 写成 `item.cityNames` 这类错误。
 * 上下游：
 *     上游：backend/app/api/* 的响应结构（改接口时同步这里）；
 *     下游：shared/api.ts、areas/* 的视图与详情组件。
 */

/** 内容 JSON 里的原始条目：11 类档案结构各不相同，这里按动态对象处理。 */
export type ArchiveItem = Record<string, any>

// ---------------------------------------------------------------- 世界层

export interface Faction {
  name: string
  kind: string
  note: string
}

export interface Nation {
  id: string
  name: string
  era: string
  gov: string
  blurb: string
  stance: string
}

export interface Sect {
  id: string
  name: string
  tradition: string
  doctrine: string
  resource: string
  blurb: string
  /** 对象 id -> 关系词（如全真 → 同源） */
  relations: Record<string, string>
}

export interface Agency {
  id: string
  name: string
  mandate: string
  authority: string
  blurb: string
  relation: string
}

export interface Figure {
  id: string
  name: string
  title: string
  org: string
  element: string
  blurb: string
  hook: string
}

export interface Industry {
  id: string
  name: string
  scale: number
  risk: number
  blurb: string
}

export interface CityTier {
  key: string
  name: string
  pop: string
  max_events: number
  blurb: string
}

export interface City {
  id: string
  name: string
  tier: string
  nation: string
  pop: number
  industries: string[]
  landmarks: string[]
  blurb: string
  /** world.json 里的旧字段，档案页不编辑 */
  missions?: string[]
  // 以下由 /api/world 与 /api/game/city 拼出来
  lat: number
  lon: number
  tier_name: string
  nation_name: string
  max_events: number
  industry_names: string[]
  factions: Faction[]
}

export interface Lore {
  id: string
  title: string
  body: string
}

export interface WorldData {
  nations: Nation[]
  sects: Sect[]
  agencies: Agency[]
  figures: Figure[]
  industries: Industry[]
  tiers: CityTier[]
  cities: City[]
  lore: Lore[]
}

// ---------------------------------------------------------------- 事件 / 任务 / 装备 / 特性

export interface GradeInfo {
  key: string
  name: string
  weight_scale?: number
  blurb?: string
}

export interface TraitRef {
  name: string
  tier?: number
  desc?: string
  effect?: Record<string, number>
}

export interface EventItem {
  id: string
  name: string
  grade: number
  scope: 'general' | 'mission'
  missions?: string[]
  industries: string[]
  traits: string[]
  text: string
  hook: string
  weight: number
  // 由 /api/events 拼出来
  grade_name: string
  trait_names: TraitRef[]
}

export interface EventsPayload {
  events: EventItem[]
  grades: Record<string, GradeInfo>
  trait_tiers: Record<string, GradeInfo>
}

export interface MissionItem {
  id: string
  name: string
  tier: number
  kind: string
  cities: string[]
  scenario_id: string
  blurb: string
  // 由 /api/missions 拼出来
  city_names: string[]
  scenario?: string
}

export interface RandomType {
  city: string
  city_name: string
  tier: string
  industries: string[]
}

export interface MissionsPayload {
  missions: MissionItem[]
  random_types: RandomType[]
}

export interface EquipmentItem {
  id: string
  name: string
  kind: string
  grade: number
  price: number
  effect: string
  desc: string
  grade_name: string
}

export interface EquipmentPayload {
  equipment: EquipmentItem[]
  kinds: string[]
}

export interface TraitItem {
  name: string
  tier: number
  desc: string
  effect: Record<string, number>
  tier_name: string
}

export interface TraitsPayload {
  traits: TraitItem[]
  tiers: Record<string, GradeInfo>
}

export interface ScenarioItem {
  id: string
  name: string
  code: string
  brief?: string
  place?: string
}

export interface ScenarioPayload {
  scenarios: ScenarioItem[]
  bestiary: unknown[]
  talismans: unknown[]
  spirits: unknown[]
  shop: unknown[]
}

// ---------------------------------------------------------------- 人物 / 游戏 / 会话

export interface RosterRow {
  id: number
  code: string
  name: string
  school: string
  school_name: string
  element: string
  rarity: string
  rank: string
  merit: number
  kind: string
  city: string
  city_name: string
  city_tier: string
  events: Array<{ id?: string; name?: string } | string>
  difficulty: number
  reward: number
  stats: { hp_max: number; mp_max: number; san_max: number }
}

export interface RateRow {
  key: string
  name: string
  weight: number
  bonus: number
  dice: string
  traits: number
  rank: string
  pct: number
}

export interface RosterPayload {
  rows: RosterRow[]
  rate: RateRow[]
}

export interface DashboardPayload {
  totals: { characters: number; sessions: number; active: number; avg_load: number }
  by_rarity: Record<string, number>
  recent_chars: RosterRow[]
  recent_sessions: Array<{
    id: number
    code: string
    character_id: number
    character_name: string
    scenario_name: string
    status: string
    corruption: number
    created_at: string
  }>
  logs: Array<{ seq: number; kind: string; severity: string; text: string }>
}

export interface MapCity {
  id: string
  name: string
  tier: string
  tier_name: string
  nation: string
  lat: number
  lon: number
  people: number
  missions: number
  factions: number
}

export interface MapPayload {
  cities: MapCity[]
}

export interface RandomMissionSample {
  id: string
  name: string
  code: string
  city_name: string
  difficulty: number
  grade: string
  reward: number
  event_names: string[]
  monster: { id: string; name: string; hp: number }
  scenes: number
}

export interface CityPanelPayload {
  city: City
  missions: MissionItem[]
  random_missions: RandomMissionSample[]
  people: RosterRow[]
  factions: Faction[]
}

export interface CharacterAttr {
  key: string
  label: string
  value: number
  pct: number
  tier: string
}

export interface CharacterSkill {
  id: string
  name: string
  value: number
}

export interface ShopItem {
  id: string
  name: string
  price: number
  kind: string
  desc: string
  effect: Record<string, any>
  max_qty?: number
  owned?: number
  afford?: boolean
  full?: boolean
  corrupt?: boolean
  requires_rank?: string
}

export interface ProgressRow {
  key: string
  label: string
  have: number
  need: number
  unit: string
  ok: boolean
  pct: number
}

export interface CharacterSheet {
  id: number
  code: string
  name: string
  kind: string
  city: { id: string; name: string; tier: string; tier_name: string }
  events: Array<{ id: string; name: string; grade?: number; grade_name?: string; text?: string; hook?: string }>
  difficulty: number
  reward: number
  school: string
  school_name: string
  tagline: string
  element: string
  rarity: string
  rank: string
  merit: number
  karma_debt: number
  completed_sessions: number
  notes: string
  seed: string
  attrs: CharacterAttr[]
  skills: CharacterSkill[]
  stats: Record<string, number>
  traits: Array<{ name: string; desc?: string; tier?: number }>
  items: Array<{ id: string; name: string; qty: number }>
  ascensions: Array<{ from: string; to: string; at?: string; opened?: string[] }>
  spirits: Array<Record<string, any>>
  missions: Array<{ id: string; code: string; name: string; brief: string }>
  sessions: Array<{ id: number; code: string; status: string; scenario_name: string; corruption: number }>
  progress: {
    next_rank: string | null
    promotable: boolean
    reqs: ProgressRow[]
    trial_attempts: number
    trial_passed: boolean
  }
  shelf: ShopItem[]
}

export interface MeterView {
  value: number
  max: number
  label: string
}

export interface SessionScene {
  id: string
  kind: string
  name: string
  place: string
  text: string
  index: number
  total: number
}

export interface SessionAction {
  id: string
  label: string
  kind: string
  hint: string
  cost: Record<string, number>
  enabled: boolean
  skill?: string
  skill_name?: string
}

export interface EnemyView {
  name: string
  hp: number
  max_hp: number
  state: string
  phase_label: string
  element: string
  weakness: string[]
  lore: string
}

export interface SessionEnding {
  grade: string
  reason: string
  text: string
  merit_award: number
  clues: number
  karma: string[]
}

export interface SessionView {
  status: string
  turn: number
  scene: SessionScene
  bars: Record<string, MeterView>
  clues: string[]
  enemy: EnemyView | null
  summon: Record<string, any> | null
  inventory: Record<string, number>
  karma: Array<{ id: string; karma: string }>
  actions: SessionAction[]
  ending: SessionEnding | null
  stats: Record<string, any>
}

export interface SessionLog {
  kind: string
  severity: string
  text: string
}

export interface SessionPayload {
  id: number
  code: string
  status: string
  character: { id: number; code: string; name: string }
  scenario: { id: string; code: string; name: string }
  view: SessionView
  logs: SessionLog[]
}

export interface SessionActPayload {
  events: Array<{ kind: string; severity: string; text: string }>
  status: string
  view: SessionView
}

// ---------------------------------------------------------------- 档案编辑

/** 档案类别 key，与后端 edit.py 的 KINDS 一一对应。 */
export type ArchiveKind =
  | 'cities' | 'figures' | 'agencies' | 'sects' | 'industries' | 'nations' | 'lore'
  | 'events' | 'missions' | 'equipment' | 'traits'

export interface ArchiveSavePayload {
  ok: boolean
  kind: ArchiveKind
  item: ArchiveItem
  count: number
}

/** 下拉选项：value 的类型随字段不同（id 是字符串，等级是数字）。 */
export interface FieldOption {
  value: string | number
  label: string
}
