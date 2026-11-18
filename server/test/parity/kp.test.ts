/** KP 事件对拍：分层触发、描述、过场与提示。 */
import { describe, expect, it } from 'vitest'
import { Roller } from '../../src/core/dice.ts'
import { event, stuckHint, transition } from '../../src/core/kp.ts'
import { fixture } from '../helpers.ts'

const data = fixture<any>('kp.json')
const plain = (value: unknown) => JSON.parse(JSON.stringify(value))

describe('KP 事件对拍', () => {
  for (const row of data.events) {
    it(`阴浊 ${row.corruption} / ${row.seed}`, () => {
      const roller = new Roller(row.seed)
      const events = Array.from({ length: 6 }, (_, i) => event(roller, row.corruption, i % 2 === 1))
      expect(plain(events)).toEqual(row.events)
    })
  }
  for (const [index, expected] of data.transitions.entries()) {
    it(`过场 #${index}`, () => {
      expect(transition(new Roller(`trans-${index}`))).toBe(expected)
    })
  }
  for (const [index, expected] of data.hints.entries()) {
    it(`提示 #${index}`, () => {
      expect(stuckHint(new Roller(`hint-${index}`), Array.from({ length: index }, (_, i) => `c${i}`))).toBe(expected)
    })
  }
})
