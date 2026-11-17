/** 随机任务对拍：固定城市 + key，整份任务 JSON 必须一致。 */
import { describe, expect, it } from 'vitest'
import { ContentStore } from '../../src/content/store.ts'
import { loadContent } from '../../src/content/index.ts'
import { generate } from '../../src/core/mission.ts'
import { CONTENT_DIR, fixture } from '../helpers.ts'

const content = loadContent(new ContentStore(CONTENT_DIR))
const cases = fixture<Array<{ city: string; seed: string }>>('missions.json')
const plain = (value: unknown) => JSON.parse(JSON.stringify(value))
const cities = ['nanyu', 'linjing', 'lijiang', 'yunjin', 'baishi']

describe('随机任务对拍', () => {
  let index = 0
  for (const city of cities) {
    for (const key of [`golden-${city}`, 'abc']) {
      it(`${city} / ${key}`, () => {
        expect(plain(generate(content, city, key))).toEqual(cases[index++])
      })
    }
  }
})
