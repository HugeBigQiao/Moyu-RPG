/** 成长线对拍：要求、晋升、试炼、商店。 */
import { describe, expect, it } from 'vitest'
import { ContentStore } from '../../src/content/store.ts'
import { loadContent } from '../../src/content/index.ts'
import { buy, promotable, promote, requirements, trial } from '../../src/core/progress.ts'
import type { CharacterLike } from '../../src/core/types.ts'
import { CONTENT_DIR, fixture } from '../helpers.ts'

const content = loadContent(new ContentStore(CONTENT_DIR))
const data = fixture<any>('progress.json')
const plain = (value: unknown) => JSON.parse(JSON.stringify(value))

const baseCard: CharacterLike = {
  school: 'fulu', element: '木', rank: '初真', merit: 20,
  attrs: { str: 10, agi: 12, con: 11, int: 15, wil: 13, per: 14 },
  traits: [{ name: '胆大', tier: 3 }, { name: '耳聪', tier: 4 }],
  items: [], karma_debt: 0, skill_bonus: {},
}

describe('成长线对拍', () => {
  for (const [index, row] of data.requirements.entries()) {
    it(`晋升要求 #${index}`, () => {
      expect(plain(requirements(row.card))).toEqual(row.requirements)
      expect(promotable(row.card)).toBe(row.promotable)
    })
  }

  for (const [index, expected] of data.promotions.entries()) {
    it(`晋升结果 #${index}`, () => {
      const card = JSON.parse(JSON.stringify(data.requirements[index].card))
      if (expected.error) {
        expect(() => promote(content, card)).toThrow(expected.error)
      } else {
        expect(plain(promote(content, card))).toEqual(expected.result)
        expect(plain(card)).toEqual(expected.card)
      }
    })
  }

  for (const [index, expected] of data.trials.entries()) {
    it(`心魔试炼 #${index}`, () => {
      expect(plain(trial(content, baseCard, `trial-${index}`))).toEqual(expected)
    })
  }

  let card: any = { ...baseCard, rank: '天师', merit: 500 }
  for (const [index, expected] of data.buys.entries()) {
    it(`商店购买 #${index} ${expected.item_id}`, () => {
      const copy = JSON.parse(JSON.stringify(card))
      if (expected.error) {
        expect(() => buy(content, copy, expected.item_id)).toThrow(expected.error)
      } else {
        expect(plain(buy(content, copy, expected.item_id))).toEqual(expected.result)
        expect(plain(copy)).toEqual(expected.card)
        card = copy
      }
    })
  }
})
