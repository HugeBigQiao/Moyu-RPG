/**
 * 事件索引与兼容性判定。
 *
 * 职责：
 *     读事件表，按城市/任务/等级筛出带权事件池。
 * 为什么需要：
 *     人物出身与随机任务共用同一套抽样规则，写两份必然漂移。
 * 上下游：
 *     上游：events.json、world；下游：npc、mission、api/archive。
 */
import { tierRank, type City, type WorldIndex } from './world.ts'

export interface GradeInfo {
  key?: string
  name: string
  weight_scale: number
  [key: string]: any
}

export interface EventItem {
  id: string
  name: string
  grade: number
  scope: 'general' | 'mission'
  missions?: string[]
  industries?: string[]
  traits?: string[]
  text: string
  hook: string
  weight?: number
  [key: string]: any
}

export interface EventsDoc {
  events: EventItem[]
  grades: Record<string, GradeInfo>
}

export interface EventsIndex {
  events: EventItem[]
  byId: Map<string, EventItem>
  grades: Record<number, GradeInfo>
}

export function indexEvents(doc: EventsDoc): EventsIndex {
  const events = doc.events ?? []
  const grades: Record<number, GradeInfo> = {}
  for (const [key, value] of Object.entries(doc.grades ?? {})) grades[Number(key)] = value
  return { events, byId: new Map(events.map((item) => [item.id, item])), grades }
}

export function getEvent(events: EventsIndex, eventId: string): EventItem | undefined {
  return events.byId.get(eventId)
}

export function gradeName(events: EventsIndex, grade: number): string {
  return events.grades[grade]?.name ?? '?'
}

/** 这条事件能不能落在「这个城市 + 这个任务」上。 */
export function compatible(event: EventItem, city: City, missionId?: string | null): boolean {
  const scope = event.scope ?? 'general'
  if (scope === 'mission') {
    if (!missionId || !(event.missions ?? []).includes(missionId)) return false
  }
  const cities = event.cities ?? []
  if (cities.length && !cities.includes(city.id)) return false
  const industries = event.industries ?? []
  if (industries.length && !industries.some((id) => (city.industries ?? []).includes(id))) return false
  return true
}

/** 某城市某任务下可选的事件，带权重。 */
export function eventPool(
  events: EventsIndex,
  world: WorldIndex,
  city: City,
  missionId: string | null,
  maxGrade = 4,
  background = false,
): Array<[EventItem, number]> {
  const out: Array<[EventItem, number]> = []
  for (const event of events.events) {
    if (event.grade > maxGrade) continue
    let penalty = 1.0
    if ((event.scope ?? 'general') === 'mission' && missionId === null) {
      if (!background) continue
      if (tierRank(world, city.tier) > 1) continue
      const industries = event.industries ?? []
      if (industries.length && !industries.some((id) => (city.industries ?? []).includes(id))) continue
      penalty = 0.3
    } else if (!compatible(event, city, missionId)) {
      continue
    }
    const weight = Number(event.weight ?? 10) * Number(events.grades[event.grade]?.weight_scale ?? 1) * penalty
    out.push([event, weight])
  }
  return out
}
