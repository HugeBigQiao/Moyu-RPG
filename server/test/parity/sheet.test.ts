/**
 * 角色卡对拍：derived / skill_value / display_attrs / trait_sum 与 Python 一致。
 *
 * 内容直接读 backend/data/content，保证用的是同一份 JSON；索引方式与 plugins/content 相同。
 */
import { describe, expect, it } from 'vitest'
import { indexShop, type ShopDoc } from '../../src/content/shop.ts'
import { indexTraits, type TraitsDoc } from '../../src/content/traits.ts'
import { derived, displayAttrs, skillValue, traitSum } from '../../src/core/sheet.ts'
import type { CharacterLike, DerivedStats } from '../../src/core/types.ts'
import { content, fixture } from '../helpers.ts'

interface SheetCase {
  card: CharacterLike
  derived: DerivedStats
  skills: Record<string, number>
  display_attrs: Array<Record<string, unknown>>
  trait_sum: Record<string, number>
}

const cards = fixture<SheetCase[]>('sheet.json')
const traits = indexTraits(content<TraitsDoc>('traits'))
const shop = indexShop(content<ShopDoc>('shop'))
const deps = { traits: traits.traits, shop }

describe('角色卡对拍', () => {
  for (const [index, item] of cards.entries()) {
    it(`card #${index + 1} ${item.card.school}/${item.card.rank}`, () => {
      expect(derived(item.card, deps)).toEqual(item.derived)
      for (const [skillId, value] of Object.entries(item.skills)) {
        expect(skillValue(item.card, skillId, deps)).toBe(value)
      }
      expect(displayAttrs(item.card)).toEqual(item.display_attrs)
      for (const [key, value] of Object.entries(item.trait_sum)) {
        expect(traitSum(item.card, key, traits.traits)).toBe(value)
      }
    })
  }
})
