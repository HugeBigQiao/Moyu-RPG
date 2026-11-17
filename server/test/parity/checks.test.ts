/**
 * 检定对拍：与 Python app/engine/checks.py 的 as_dict/describe/history 逐字段一致。
 */
import { describe, expect, it } from 'vitest'
import { asDict, describe as describeCheck, resolve } from '../../src/core/checks.ts'
import { Roller } from '../../src/core/dice.ts'
import { fixture } from '../helpers.ts'

interface CheckCase {
  seed: string
  skill: string
  value: number
  modifier: number
  result: Record<string, unknown>
  text: string
  history: Array<Record<string, unknown>>
}

const cases = fixture<CheckCase[]>('checks.json')

describe('检定对拍', () => {
  for (const item of cases) {
    it(`${item.seed} ${item.skill}`, () => {
      const roller = new Roller(item.seed)
      const result = resolve(roller, item.skill, item.value, item.modifier, '', '勘查')
      expect(asDict(result)).toEqual(item.result)
      expect(describeCheck(result)).toBe(item.text)
      expect(roller.history).toEqual(item.history)
    })
  }
})
