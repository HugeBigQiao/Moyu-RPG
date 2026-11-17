/** 人物生成对拍：NPC、玩家掷点、自建角色。 */
import { describe, expect, it } from 'vitest'
import { ContentStore } from '../../src/content/store.ts'
import { loadContent } from '../../src/content/index.ts'
import { buildPlayer, rollNpc, rollPlayerAttrs } from '../../src/core/npc.ts'
import { CONTENT_DIR, fixture } from '../helpers.ts'

const content = loadContent(new ContentStore(CONTENT_DIR))
const data = fixture<{
  npcs: unknown[]
  attrs: unknown[]
  players: unknown[]
}>('npc.json')
const plain = (value: unknown) => JSON.parse(JSON.stringify(value))
const cities = ['nanyu', 'linjing', 'lijiang', 'yunjin', 'baishi']
const missionId = content.missions.missions[0].id

describe('人物生成对拍', () => {
  const expectedNpcs = data.npcs
  let cursor = 0
  for (const city of cities) {
    it(`NPC ${city}`, () => {
      expect(plain(rollNpc(content, { cityId: city, seed: `npc-${city}` }))).toEqual(expectedNpcs[cursor++])
    })
    it(`NPC ${city} + 任务`, () => {
      expect(plain(rollNpc(content, {
        cityId: city, missionId, seed: `npc-m-${city}`,
      }))).toEqual(expectedNpcs[cursor++])
    })
  }
  it('NPC 任意城市', () => {
    expect(plain(rollNpc(content, { seed: 'npc-any' }))).toEqual(expectedNpcs[cursor++])
  })

  for (const [index, expected] of data.attrs.entries()) {
    it(`玩家掷点 ${index}`, () => {
      expect(plain(rollPlayerAttrs(`attrs-${index}`))).toEqual(expected)
    })
  }

  const payloads = [
    { name: '测试甲', school: 'fulu', element: '金', city: 'nanyu' },
    { name: '测试乙', school: 'neidan', element: '水', city: 'linjing', notes: '自建' },
    {
      name: '测试丙', school: 'guti', element: '土', city: 'lijiang',
      attrs: { str: 14, agi: 10, con: 15, int: 9, wil: 11, per: 13 },
    },
  ]
  for (const [index, payload] of payloads.entries()) {
    it(`玩家自建 ${index}`, () => {
      expect(plain(buildPlayer(content, payload as any, `player-${index}`))).toEqual(data.players[index])
    })
  }
})
