/**
 * 五行对拍：关系、倍率、检定修正与 Python 完全一致。
 *
 * describe 在 attacker/defender 为 null 时会涉及 Python 的 "None" 拼字符串，
 * 而接口实际不会传 null，所以只在两端都非空时比对文案。
 */
import { describe, expect, it } from 'vitest'
import { checkModifier, describe as describeWuxing, multiplier, relation, type Element } from '../../src/core/wuxing.ts'
import { fixture } from '../helpers.ts'

interface WuxingCase {
  attacker: string | null
  defender: string | null
  relation: string
  multiplier: number
  check_modifier: number
  describe: string
}

const rows = fixture<WuxingCase[]>('wuxing.json')

describe('五行对拍', () => {
  for (const row of rows) {
    it(`${row.attacker ?? 'null'} → ${row.defender ?? 'null'}`, () => {
      const attacker = row.attacker as Element
      const defender = row.defender as Element
      expect(relation(attacker, defender)).toBe(row.relation)
      expect(multiplier(attacker, defender)).toBe(row.multiplier)
      expect(checkModifier(attacker, defender)).toBe(row.check_modifier)
      if (row.attacker && row.defender) {
        expect(describeWuxing(attacker, defender)).toBe(row.describe)
      }
    })
  }
})
