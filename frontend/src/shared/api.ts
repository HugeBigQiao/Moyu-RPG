/**
 * 对 /api 的薄封装。
 *
 * 职责：
 *     统一请求头、错误解析与 JSON 反序列化；每个后端接口对应一个带类型的方法。
 * 为什么需要：
 *     视图里不该出现 fetch 细节；后端错误统一是 `{detail: "中文原因"}`，
 *     也只在这一次性解析，页面拿到的就是可直接展示的 Error。
 * 上下游：
 *     上游：backend/app/api/*；下游：areas/* 的视图与档案编辑器。
 */
import type {
  ArchiveItem,
  ArchiveKind,
  ArchiveSavePayload,
  CityPanelPayload,
  CharacterSheet,
  DashboardPayload,
  EquipmentPayload,
  EventsPayload,
  MapPayload,
  MissionsPayload,
  RosterPayload,
  RosterRow,
  ScenarioPayload,
  SessionActPayload,
  SessionPayload,
  TraitsPayload,
  WorldData
} from './types'

const BASE = '/api'

// ---------------------------------------------------------------- 小响应体

/** 存档人物：后端返回 id + code + 列表用的摘要。 */
export interface CharacterBriefPayload {
  id: number
  code: string
  brief: RosterRow
}

export interface NpcPayload {
  created: number
  people: RosterRow[]
}

export interface AttrRollPayload {
  attrs: Record<string, number>
  total: number
  seed: string
}

export interface PromotePayload {
  ok: boolean
  from: string
  to: string
  opened: string[]
}

export interface TrialRoll {
  roll: number
  target: number
  level: string
  success: boolean
}

export interface TrialPayload {
  ok: boolean
  passed: boolean
  passes: number
  need: number
  rolls: TrialRoll[]
  text: string
}

export interface BuyPayload {
  item: string
  spent: number
  left: number
}

export interface StartSessionPayload {
  id: number
  code: string
}

export interface StartRandomPayload extends StartSessionPayload {
  name: string
  difficulty: number
  reward: number
}

export interface ArchiveKindsPayload {
  kinds: Array<{ key: ArchiveKind; label: string }>
}

// ---------------------------------------------------------------- 请求

/**
 * 发一次 JSON 请求并解析响应。
 *
 * 参数：
 *     path：/api 之后的路径。
 *     opts：fetch 配置（method / body 等）。
 * 为什么需要：
 *     错误消息的格式只在这里解析一次，页面里不需要再判断 res.ok。
 * 输出：
 *     T；失败时抛 Error（message 是后端给的中文原因）。
 */
async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  })
  const text = await res.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { detail: text }
  }
  if (!res.ok) {
    throw new Error((data && (data.detail || data.message)) || `HTTP ${res.status}`)
  }
  return data as T
}

const post = <T>(path: string, body?: unknown): Promise<T> =>
  req<T>(path, { method: 'POST', body: JSON.stringify(body || {}) })

const put = <T>(path: string, body?: unknown): Promise<T> =>
  req<T>(path, { method: 'PUT', body: JSON.stringify(body || {}) })

const del = <T>(path: string): Promise<T> => req<T>(path, { method: 'DELETE' })

export const api = {
  // ---------------- 档案（只读）
  world: () => req<WorldData>('/world'),
  events: () => req<EventsPayload>('/events'),
  missions: () => req<MissionsPayload>('/missions'),
  equipment: () => req<EquipmentPayload>('/equipment'),
  traits: () => req<TraitsPayload>('/traits'),
  scenarios: () => req<ScenarioPayload>('/scenarios'),
  dashboard: () => req<DashboardPayload>('/dashboard'),

  // ---------------- 档案编辑（写回 data/content/*.json）
  archiveKinds: () => req<ArchiveKindsPayload>('/archive/kinds'),
  archiveCreate: (kind: ArchiveKind, item: ArchiveItem) =>
    post<ArchiveSavePayload>(`/archive/${kind}`, { item }),
  archiveUpdate: (kind: ArchiveKind, id: string, item: ArchiveItem) =>
    put<ArchiveSavePayload>(`/archive/${kind}/${encodeURIComponent(id)}`, { item }),
  archiveDelete: (kind: ArchiveKind, id: string) =>
    del<ArchiveSavePayload>(`/archive/${kind}/${encodeURIComponent(id)}`),

  // ---------------- 人物
  roster: () => req<RosterPayload>('/roster'),
  character: (id: string | number) => req<CharacterSheet>(`/characters/${id}`),
  rollAttrs: () => post<AttrRollPayload>('/characters/roll'),
  createPlayer: (payload: Record<string, unknown>) =>
    post<CharacterBriefPayload>('/characters', payload),
  npcs: (count: number, city?: string | null) => post<NpcPayload>('/npcs', { count, city: city || null }),
  promote: (id: string | number) => post<PromotePayload>(`/characters/${id}/promote`),
  trial: (id: string | number) => post<TrialPayload>(`/characters/${id}/trial`),
  buy: (id: string | number, itemId: string) =>
    post<BuyPayload>(`/characters/${id}/buy`, { item_id: itemId }),
  remove: (id: string | number) => del<{ ok: boolean }>(`/characters/${id}`),

  // ---------------- 游戏
  gameMap: () => req<MapPayload>('/game/map'),
  gameCity: (id: string) => req<CityPanelPayload>(`/game/city/${id}`),
  startSession: (characterId: number, scenarioId: string) =>
    post<StartSessionPayload>('/sessions', { character_id: characterId, scenario_id: scenarioId }),
  startRandom: (characterId: number, city?: string | null) =>
    post<StartRandomPayload>('/sessions/random', { character_id: characterId, city: city || null }),
  session: (id: string | number) => req<SessionPayload>(`/sessions/${id}`),
  act: (id: string | number, action: string) =>
    post<SessionActPayload>(`/sessions/${id}/act`, { action })
}
