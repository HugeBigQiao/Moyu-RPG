/**
 * d100 检定。
 *
 * 职责：
 *     把技能值、修正、掷骰合成一次检定结果（大成功→大失败）。
 * 为什么需要：
 *     所有判定共用同一套阈值；各写各的会导致数值与旧局对不上。
 * 上下游：
 *     上游：dice；下游：session、progress。
 */
import type { Roller } from './dice.ts'
import { signed } from './python.ts'

export const LEVELS = ['大成功', '极难成功', '困难成功', '成功', '失败', '大失败'] as const
export type Level = (typeof LEVELS)[number]

export interface CheckResult {
  skill: string
  target: number
  raw_target: number
  roll: number
  level: Level
  success: boolean
  modifier: number
  note: string
}

/** Python `as_dict()` 的等价物：raw_target 是内部字段，不进接口响应。 */
export interface CheckResultDict {
  skill: string
  target: number
  roll: number
  level: Level
  success: boolean
  modifier: number
  note: string
}

export function resolve(
  roller: Roller,
  skill: string,
  skillValue: number,
  modifier = 0,
  note = '',
  reason = '',
): CheckResult {
  const raw = Math.max(1, Math.min(99, Math.trunc(skillValue)))
  const target = Math.max(1, Math.min(99, raw + modifier))
  const roll = roller.d100(reason || skill)

  const fumbleAt = target >= 50 ? 100 : 96
  let level: Level
  if (roll >= fumbleAt) level = '大失败'
  else if (roll <= Math.max(1, Math.floor(target / 5))) level = '大成功'
  else if (roll <= Math.max(1, Math.floor(target / 2))) level = '极难成功'
  else if (roll <= target) level = '困难成功'
  else level = '失败'

  return {
    skill,
    target,
    raw_target: raw,
    roll,
    level,
    success: level !== '失败' && level !== '大失败',
    modifier,
    note,
  }
}

export function asDict(result: CheckResult): CheckResultDict {
  return {
    skill: result.skill,
    target: result.target,
    roll: result.roll,
    level: result.level,
    success: result.success,
    modifier: result.modifier,
    note: result.note,
  }
}

export function describe(result: CheckResult): string {
  let head = `【${result.skill}】${result.roll} / 目标 ${result.target}（${signed(result.modifier)}）→ ${result.level}`
  if (result.note) head += '｜' + result.note
  return head
}

export function skillColor(level: string): string {
  return (
    {
      大成功: 'crit',
      极难成功: 'great',
      困难成功: 'good',
      成功: 'ok',
      失败: 'miss',
      大失败: 'fumble',
    }[level] ?? 'ok'
  )
}
