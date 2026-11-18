/**
 * 任务索引与难度换算。
 *
 * 职责：
 *     固定任务的 id 索引、按城市筛选，以及难度/报酬/等级标签的统一公式。
 * 为什么需要：
 *     固定任务与随机任务必须共用同一套数值，否则同一只祟物两个价。
 * 上下游：
 *     上游：missions.json、scenarios、world；下游：mission、api/game。
 */
import { pyRound } from '../core/python.ts'

export interface MissionItem {
  id: string
  name: string
  tier?: number
  kind?: string
  cities?: string[]
  scenario_id?: string
  blurb?: string
  [key: string]: any
}

export interface MissionsDoc {
  missions: MissionItem[]
}

export interface MissionsIndex {
  missions: MissionItem[]
  byId: Map<string, MissionItem>
}

export function indexMissions(doc: MissionsDoc): MissionsIndex {
  const missions = doc.missions ?? []
  return { missions, byId: new Map(missions.map((item) => [item.id, item])) }
}

export function difficultyOf(events: Array<{ grade: number }>, monsterHp = 0, cityTier = 't2'): number {
  const base = events.reduce((sum, event) => sum + (5 - Number(event.grade)), 0)
  const weight = pyRound(monsterHp / 10)
  const tierBonus = { t0: 3, t1: 2, t2: 1, t3: 0, t4: -1 }[cityTier] ?? 1
  return Math.max(1, base * 2 + weight + tierBonus)
}

export function rewardOf(difficulty: number): number {
  return Math.max(5, difficulty * 3)
}

export function gradeLabel(difficulty: number): string {
  if (difficulty >= 24) return '甲'
  if (difficulty >= 16) return '乙'
  if (difficulty >= 9) return '丙'
  return '丁'
}
