/**
 * PRNG 对拍：TS 的 PythonRandom/Roller 必须与 Python 逐位一致。
 *
 * 覆盖：
 *   - 字符串种子（sha256 → int）后的 d100/d6/randint/choice/shuffle/sample/chance/weighted；
 *   - int 种子的 getrandbits（1/7/31/32/33/63/64/100 位）；
 *   - Python round 的银行家舍入。
 */
import { describe, expect, it } from 'vitest'
import { PythonRandom, Roller } from '../../src/core/dice.ts'
import { pyRound } from '../../src/core/python.ts'
import { fixture } from '../helpers.ts'

interface StringSeed {
  seed: string
  d100: number[]
  d6: number[]
  randint: number[]
  choice: string[]
  shuffle: number[]
  sample: number[]
  sample_small: number[]
  chance: boolean[]
  weighted: string[]
  history: Array<Record<string, unknown>>
}

interface PrngFixture {
  string_seeds: StringSeed[]
  int_seeds: Record<string, Record<string, string[]>>
  rounding: Array<{ input: number; round: number; round2: number; round4: number }>
}

const data = fixture<PrngFixture>('prng.json')

describe('PRNG 对拍', () => {
  for (const rec of data.string_seeds) {
    it(`string seed ${JSON.stringify(rec.seed)}`, () => {
      const roller = new Roller(rec.seed)
      expect(Array.from({ length: 12 }, () => roller.d100())).toEqual(rec.d100)
      expect(Array.from({ length: 12 }, () => roller.d(6))).toEqual(rec.d6)
      expect(Array.from({ length: 8 }, () => roller.randint(1, 6))).toEqual(rec.randint)
      expect(Array.from({ length: 8 }, () => roller.choice(['a', 'b', 'c', 'd', 'e']))).toEqual(rec.choice)
      expect(roller.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual(rec.shuffle)
      expect(roller.sample(Array.from({ length: 50 }, (_, i) => i), 5)).toEqual(rec.sample)
      expect(roller.sample(Array.from({ length: 8 }, (_, i) => i), 6)).toEqual(rec.sample_small)
      expect([0.0, 0.25, 0.5, 0.75, 1.0].map((p) => roller.chance(p))).toEqual(rec.chance)
      expect(roller.history).toEqual(rec.history)

      const weighted = new Roller(rec.seed)
      const pairs = [['w', 3], ['x', 7], ['y', 2], ['z', 9]] as const
      expect(Array.from({ length: 8 }, () => weighted.weighted(pairs))).toEqual(rec.weighted)
    })
  }

  for (const [seed, bits] of Object.entries(data.int_seeds)) {
    it(`int seed ${seed}`, () => {
      for (const [k, expected] of Object.entries(bits)) {
        const random = new PythonRandom(BigInt(seed))
        const actual = expected.map(() => random.getrandbits(Number(k)).toString())
        expect(actual).toEqual(expected)
      }
    })
  }

  it('Python round 的银行家舍入', () => {
    for (const row of data.rounding) {
      expect(pyRound(row.input)).toBe(row.round)
      expect(pyRound(row.input, 2)).toBe(row.round2)
      expect(pyRound(row.input, 4)).toBe(row.round4)
    }
  })
})
