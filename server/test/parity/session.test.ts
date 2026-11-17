/**
 * 整局回放：用 Python 导出的 35 局 golden，逐步比对状态与事件流。
 *
 * 这是 P5 的验收线：任何一处数值/分支/文案不一致都会在这里炸出来。
 */
import { describe, expect, it } from 'vitest'
import { ContentStore } from '../../src/content/store.ts'
import { loadContent } from '../../src/content/index.ts'
import { act, newState, view } from '../../src/core/session.ts'
import type { Scenario } from '../../src/content/scenarios.ts'
import type { CharacterLike } from '../../src/core/types.ts'
import { CONTENT_DIR, fixture } from '../helpers.ts'

interface SessionCase {
  seed: string
  scenario_id: string
  scenario: Scenario
  card: CharacterLike
  steps: Array<{ action: string; events: unknown[]; state: Record<string, unknown> }>
  final_state: Record<string, unknown>
  view: Record<string, unknown>
}

const content = loadContent(new ContentStore(CONTENT_DIR))
const cases = fixture<SessionCase[]>('sessions.json')

/** JSON 往返，去掉 undefined 字段，便于和 Python 导出的 JSON 做深比较。 */
function plain<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value))
}

describe('整局回放对拍', () => {
  for (const [index, item] of cases.entries()) {
    it(`${index + 1}. ${item.scenario_id} / ${item.seed}（${item.steps.length} 步）`, () => {
      const state = newState(content, item.card, item.scenario, item.seed)
      for (const [stepIndex, step] of item.steps.entries()) {
        const [, events] = act(content, item.card, item.scenario, state, step.action)
        expect(plain(events), `第 ${stepIndex + 1} 步 ${step.action} 的事件流`).toEqual(step.events)
        expect(plain(state), `第 ${stepIndex + 1} 步 ${step.action} 的状态`).toEqual(step.state)
      }
      expect(plain(state)).toEqual(item.final_state)
      expect(plain(view(content, item.card, item.scenario, state))).toEqual(item.view)
    })
  }
})
