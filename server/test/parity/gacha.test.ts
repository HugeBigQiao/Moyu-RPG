/** 抽卡对拍：roll 结果与稀有度表。 */
import { describe, expect, it } from 'vitest'
import { ContentStore } from '../../src/content/store.ts'
import { loadContent } from '../../src/content/index.ts'
import { rateTable, roll } from '../../src/core/gacha.ts'
import { CONTENT_DIR, fixture } from '../helpers.ts'

const content = loadContent(new ContentStore(CONTENT_DIR))
const data = fixture<{ cards: Array<{ seed: string }>; rates: unknown[] }>('gacha.json')
const plain = (value: unknown) => JSON.parse(JSON.stringify(value))

describe('抽卡对拍', () => {
  for (const card of data.cards) {
    it(card.seed || '(empty seed)', () => {
      expect(plain(roll(content, card.seed))).toEqual(card)
    })
  }
  it('稀有度表', () => {
    expect(plain(rateTable())).toEqual(data.rates)
  })
})
