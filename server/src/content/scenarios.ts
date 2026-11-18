/**
 * 剧本索引。
 *
 * 职责：
 *     读固定剧本（场景流、结局），提供 id 查询与按类型找第一场。
 * 为什么需要：
 *     固定任务与随机任务都复用同一套场景结构。
 * 上下游：
 *     上游：scenarios.json；下游：session、mission、api/sessions。
 */

export interface SceneOption {
  id: string
  label: string
  skill: string
  success: string
  fail: string
  clue?: string
  [key: string]: any
}

export interface SceneChoice {
  id: string
  label: string
  text: string
  merit?: number
  corruption?: number
  karma?: string
  [key: string]: any
}

export interface Scene {
  id: string
  kind: string
  name: string
  place?: string
  text?: string
  options?: SceneOption[]
  choices?: SceneChoice[]
  enemy?: string
  next?: string
  [key: string]: any
}

export interface Scenario {
  id: string
  name: string
  code: string
  brief?: string
  place?: string
  start_corruption?: number
  scenes: Scene[]
  endings?: Record<string, string>
  [key: string]: any
}

export interface ScenariosDoc {
  scenarios: Scenario[]
}

export interface ScenariosIndex {
  scenarios: Scenario[]
  byId: Map<string, Scenario>
}

export function indexScenarios(doc: ScenariosDoc): ScenariosIndex {
  const scenarios = doc.scenarios ?? []
  return { scenarios, byId: new Map(scenarios.map((item) => [item.id, item])) }
}
