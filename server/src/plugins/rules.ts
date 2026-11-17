/**
 * 规则服务。
 *
 * 职责：
 *     把纯函数引擎包成 ctx.rules：检定、五行、角色卡计算。
 * 为什么需要：
 *     引擎本身不依赖 cordis（保持可单测、可回放）；这里只做装配，
 *     让「谁依赖内容」由 inject 表达，而不是 import 顺序。
 * 上下游：
 *     上游：core/*、plugins/content；下游：plugins/game、plugins/api-*。
 */
import { Service, type Context } from 'cordis'
import { asDict, describe, resolve, type CheckResult, type CheckResultDict } from '../core/checks.ts'
import { Roller, type Roll } from '../core/dice.ts'
import { checkModifier, multiplier, relation, type Element } from '../core/wuxing.ts'
import { derived, displayAttrs, skillValue, type SheetDeps } from '../core/sheet.ts'
import type { CharacterLike, DerivedStats } from '../core/types.ts'
import type { Content } from './content.ts'

declare module 'cordis' {
  interface Context {
    rules: Rules
  }
}

export interface CheckPayload {
  seed: string
  skill: string
  value: number
  modifier?: number
  reason?: string
}

export class Rules extends Service {
  static inject = ['content']

  constructor(ctx: Context) {
    super(ctx, 'rules')
  }

  private get content(): Content {
    return this.ctx.get('content') as Content
  }

  private deps(): SheetDeps {
    return { traits: this.content.data.traits.traits, shop: this.content.data.shop }
  }

  check(payload: CheckPayload): {
    result: CheckResultDict
    text: string
    history: Roll[]
  } {
    const roller = new Roller(payload.seed)
    const result: CheckResult = resolve(
      roller,
      payload.skill,
      payload.value,
      payload.modifier ?? 0,
      '',
      payload.reason ?? '',
    )
    return { result: asDict(result), text: describe(result), history: roller.history }
  }

  wuxing(attacker: Element, defender: Element) {
    return {
      relation: relation(attacker, defender),
      multiplier: multiplier(attacker, defender),
      check_modifier: checkModifier(attacker, defender),
    }
  }

  derived(character: CharacterLike): DerivedStats {
    return derived(character, this.deps())
  }

  skillValue(character: CharacterLike, skillId: string): number {
    return skillValue(character, skillId, this.deps())
  }

  displayAttrs(character: CharacterLike) {
    return displayAttrs(character)
  }
}
