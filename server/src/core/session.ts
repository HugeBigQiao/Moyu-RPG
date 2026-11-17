/**
 * 一局的流程引擎。
 *
 * 职责：
 *     状态机：勘查、遭遇、抉择、结算；处理伤害、形态变化、KP 事件与结局。
 * 为什么需要：
 *     这是全项目最复杂的一块，必须与接口层解耦才能单测与回放。
 * 上下游：
 *     上游：checks、wuxing、kp、content/*；下游：api/sessions。
 */
import type { GameContent } from '../content/index.ts'
import { phaseFor, phaseIndex, stateGate, type Monster } from '../content/bestiary.ts'
import { effectsOf } from '../content/shop.ts'
import { approvalCost, RANKS } from '../content/spirits.ts'
import type { Scene, Scenario } from '../content/scenarios.ts'
import type { Talisman } from '../content/talismans.ts'
import { asDict, describe, resolve, type CheckResult } from './checks.ts'
import { Roller, newSeed } from './dice.ts'
import * as kp from './kp.ts'
import { pyRound } from './python.ts'
import { derived, SKILLS, skillValue } from './sheet.ts'
import type { CharacterLike } from './types.ts'
import { checkModifier, describe as describeWuxing, multiplier } from './wuxing.ts'

export const ACTIVE = 'active'
export const DONE = 'done'

export interface GameEvent {
  kind: string
  text: string
  severity: string
  payload: Record<string, any>
}

export interface EnemyState {
  id: string
  name: string
  element: string
  hp: number
  max_hp: number
  boost: number
  stunned?: number
}

export interface SessionState {
  seed: string
  scene_index: number
  turn: number
  status: string
  corruption: number
  clues: string[]
  hp: number
  hp_max: number
  mp: number
  mp_max: number
  san: number
  san_max: number
  jianyi: number
  shaqi: number
  draw_pool: number
  inventory: Record<string, number>
  enemy: EnemyState | null
  summon: Record<string, any> | null
  ward: number
  karma: Array<{ id: string; karma: string }>
  ending: Record<string, any> | null
  merit_delta?: number
  round?: number
  scenario?: Scenario
  mission?: Record<string, any>
  [key: string]: any
}

export function event(kind: string, text: string, severity = 'info', payload: Record<string, any> = {}): GameEvent {
  return { kind, text, severity, payload }
}

function deps(content: GameContent) {
  return { traits: content.traits.traits, shop: content.shop }
}

// ---------------------------------------------------------------- 开局

export function newState(
  content: GameContent,
  card: CharacterLike,
  scenario: Scenario,
  seed?: string,
): SessionState {
  const stats = derived(card, deps(content))
  return {
    seed: seed || newSeed(),
    scene_index: 0,
    turn: 1,
    status: ACTIVE,
    corruption: Math.trunc(Number(scenario.start_corruption ?? 0)),
    clues: [],
    hp: stats.hp_max,
    hp_max: stats.hp_max,
    mp: stats.mp_max,
    mp_max: stats.mp_max,
    san: stats.san_max,
    san_max: stats.san_max,
    jianyi: 0,
    shaqi: 0,
    draw_pool: stats.draw_pool,
    inventory: {},
    enemy: null,
    summon: null,
    ward: 0,
    karma: [],
    ending: null,
  }
}

/** 每条行动都从同一个种子派生，保证「同一个种子 = 同一局」。 */
function rollerOf(state: SessionState): Roller {
  return new Roller(`${state.seed}|${state.turn * 7919 + state.clues.length}`)
}

function sceneOf(scenario: Scenario, state: SessionState): Scene {
  return scenario.scenes[Math.min(state.scene_index, scenario.scenes.length - 1)]
}

// ---------------------------------------------------------------- 视图

function clamp(state: SessionState): void {
  state.hp = Math.max(0, Math.min(state.hp_max, state.hp))
  state.mp = Math.max(0, Math.min(state.mp_max, state.mp))
  state.san = Math.max(0, Math.min(state.san_max, state.san))
  state.corruption = Math.max(0, Math.min(100, state.corruption))
}

export function view(content: GameContent, card: CharacterLike, scenario: Scenario, state: SessionState) {
  const scene = sceneOf(scenario, state)
  const stats = derived(card, deps(content))
  return {
    status: state.status,
    turn: state.turn,
    scene: {
      id: scene.id,
      kind: scene.kind,
      name: scene.name,
      place: scene.place ?? '',
      text: scene.text ?? '',
      index: state.scene_index,
      total: scenario.scenes.length,
    },
    bars: {
      hp: { value: state.hp, max: state.hp_max, label: '气血' },
      mp: { value: state.mp, max: state.mp_max, label: '灵力' },
      san: { value: state.san, max: state.san_max, label: '理智' },
      corruption: { value: state.corruption, max: 100, label: '阴浊' },
    },
    clues: state.clues,
    enemy: enemyView(content, state),
    summon: state.summon,
    inventory: state.inventory,
    karma: state.karma,
    actions: actions(content, card, scenario, state),
    ending: state.ending,
    stats,
  }
}

function enemyView(content: GameContent, state: SessionState) {
  const enemy = state.enemy
  if (!enemy) return null
  const monster = content.bestiary.byId.get(enemy.id)
  const phase = monster ? phaseFor(monster, enemy.hp) : { state: '?', label: '?' }
  return {
    name: enemy.name,
    hp: enemy.hp,
    max_hp: enemy.max_hp,
    state: phase.state,
    phase_label: phase.label,
    element: enemy.element,
    weakness: monster?.weakness ?? [],
    lore: monster?.lore ?? '',
  }
}

// ---------------------------------------------------------------- 可选项

export function actions(content: GameContent, card: CharacterLike, scenario: Scenario, state: SessionState) {
  if (state.status !== ACTIVE) return []
  const scene = sceneOf(scenario, state)
  if (scene.kind === 'investigate') return investigateActions(content, scene)
  if (scene.kind === 'combat') return combatActions(content, card, state)
  if (scene.kind === 'choice') return choiceActions(scene)
  return []
}

function investigateActions(content: GameContent, scene: Scene) {
  const out: any[] = []
  for (const opt of scene.options ?? []) {
    const skillName = SKILLS[opt.skill]?.[0] ?? opt.skill
    out.push({
      id: 'opt:' + opt.id,
      label: opt.label,
      skill: opt.skill,
      skill_name: skillName,
      kind: 'check',
      hint: `过 ${skillName}`,
      cost: {},
      enabled: true,
    })
  }
  out.push(...drawActions(content))
  return out
}

function drawActions(content: GameContent) {
  return content.talismans.talismans.map((talisman) => ({
    id: 'draw:' + talisman.id,
    label: `画一张「${talisman.name}」`,
    kind: 'draw',
    hint: `耗符力 ${talisman.draw_cost}`,
    cost: { draw: talisman.draw_cost },
    enabled: true,
  }))
}

function combatActions(content: GameContent, card: CharacterLike, state: SessionState) {
  const school = card.school
  const out: any[] = [
    { id: 'attack:melee', label: '贴身强攻', kind: 'attack', hint: '体术 · 物理', cost: {}, enabled: true },
    {
      id: 'attack:spell', label: '法术直取', kind: 'attack',
      hint: '法术 · 耗灵力 3', cost: { mp: 3 }, enabled: state.mp >= 3,
    },
  ]
  if (school === 'jianxiu' || school === 'neidan') {
    out.push({
      id: 'attack:blade', label: '御剑', kind: 'attack',
      hint: '御剑 · 耗剑意 2', cost: { jianyi: 2 }, enabled: state.jianyi >= 2,
    })
  }
  if (school === 'anqi') {
    out.push({
      id: 'attack:hidden', label: '暗器出手', kind: 'attack',
      hint: '暗器 · 耗杀气 2', cost: { shaqi: 2 }, enabled: state.shaqi >= 2,
    })
  }

  for (const [talismanId, count] of Object.entries(state.inventory ?? {})) {
    const talisman = content.talismans.byId.get(talismanId)
    if (!talisman || count <= 0) continue
    const cost = talisman.use_cost
    out.push({
      id: 'talisman:' + talismanId,
      label: `引动「${talisman.name}」×${count}`,
      kind: 'talisman',
      hint: `${talisman.element} · 耗灵力 ${cost}`,
      cost: { mp: cost },
      enabled: state.mp >= cost,
    })
  }

  out.push({
    id: 'ward', label: '结成结界', kind: 'ward',
    hint: '三回合减伤 · 耗灵力 2', cost: { mp: 2 },
    enabled: state.mp >= 2 && state.ward <= 0,
  })

  const rank = String(card.rank ?? '初真')
  const limit = RANKS.indexOf(rank as (typeof RANKS)[number])
  for (const spirit of content.spirits.spirits) {
    if (RANKS.indexOf(spirit.rank as (typeof RANKS)[number]) > limit) continue
    const approval = Number(card.approval?.[spirit.id] ?? 0)
    const discount = Math.trunc(Number(effectsOf(card, content.shop).summon_discount))
    const cost = Math.max(1, approvalCost(spirit, approval) - discount)
    out.push({
      id: 'summon:' + spirit.id,
      label: `请神：${spirit.name}`,
      kind: 'summon',
      hint: `${spirit.rank} · 耗灵力 ${cost} · 认可 ${approval}`,
      cost: { mp: cost },
      enabled: state.mp >= cost && state.summon === null,
    })
  }

  out.push({ id: 'env', label: '借用环境', kind: 'env', hint: '侦查 · 找这层楼能用的东西', cost: {}, enabled: true })
  out.push({ id: 'flee', label: '先退出去', kind: 'flee', hint: '身法 · 失败会被追击', cost: {}, enabled: true })
  return out
}

function choiceActions(scene: Scene) {
  return (scene.choices ?? []).map((choice) => ({
    id: 'choice:' + choice.id,
    label: choice.label,
    kind: 'choice',
    hint: `因果：${choice.karma ?? '未定'}`,
    cost: {},
    enabled: true,
  }))
}

// ---------------------------------------------------------------- 行动

export function act(
  content: GameContent,
  card: CharacterLike,
  scenario: Scenario,
  state: SessionState,
  actionId: string,
  _payload: Record<string, any> = {},
): [SessionState, GameEvent[]] {
  if (state.status !== ACTIVE) return [state, [event('warn', '这一局已经结束了。', 'warn')]]

  const roller = rollerOf(state)
  const scene = sceneOf(scenario, state)
  let events: GameEvent[] = []

  const [head, arg = ''] = actionId.split(':')
  if (head === 'opt') events = events.concat(doInvestigate(content, card, scenario, state, scene, arg, roller))
  else if (head === 'draw') events = events.concat(doDraw(content, state, arg))
  else if (['attack', 'talisman', 'ward', 'env', 'flee', 'summon'].includes(head)) {
    events = events.concat(doCombat(content, card, scenario, state, actionId, roller))
  } else if (head === 'choice') events = events.concat(doChoice(content, card, scenario, state, scene, arg, roller))
  else return [state, [event('warn', `看不懂这个操作：${actionId}`, 'warn')]]

  state.turn += 1
  clamp(state)
  if (state.hp <= 0 && state.status === ACTIVE) {
    events = events.concat(finalize(content, card, scenario, state, roller))
    clamp(state)
  }
  return [state, events]
}

function doInvestigate(
  content: GameContent,
  card: CharacterLike,
  scenario: Scenario,
  state: SessionState,
  scene: Scene,
  optionId: string,
  roller: Roller,
): GameEvent[] {
  const option = (scene.options ?? []).find((item) => item.id === optionId)
  if (!option) return [event('warn', '这里没有这个选项。', 'warn')]

  let modifier = 0
  if (state.corruption >= 60) modifier -= 10
  const target = skillValue(card, option.skill, deps(content))
  const result = resolve(roller, SKILLS[option.skill]?.[0] ?? option.skill, target, modifier, '', '勘查')
  const events = [event('check', describe(result), result.success ? 'good' : 'warn', {
    check: asDict(result),
  })]

  if (result.success) {
    if (option.clue && !state.clues.includes(option.clue)) {
      state.clues.push(option.clue)
      events.push(event('clue', '线索入档：' + option.clue, 'good'))
    }
    events.push(event('story', option.success, 'info'))
    events.push(...advance(content, card, scenario, state, roller))
  } else {
    const penalty = roller.roll('1d4').total
    state.corruption += penalty
    events.push(event('story', option.fail, 'warn'))
    events.push(event('corruption', `阴浊 +${penalty}。你刚才那一下，它记住了。`, 'warn'))
    events.push(...kpTick(roller, state, false))
  }
  return events
}

function doDraw(content: GameContent, state: SessionState, talismanId: string): GameEvent[] {
  const talisman = content.talismans.byId.get(talismanId)
  if (!talisman) return [event('warn', '没有这种符。', 'warn')]
  if (state.draw_pool < talisman.draw_cost) {
    return [event('warn', `今日符力不够了（剩 ${state.draw_pool}）。`, 'warn')]
  }
  state.draw_pool -= talisman.draw_cost
  state.inventory[talismanId] = (state.inventory[talismanId] ?? 0) + 1
  return [event('draw', `画好一张「${talisman.name}」，符力剩 ${state.draw_pool}。`, 'good', {
    talisman: talismanId,
  })]
}

/** 推进到下一场。遇到战斗场就召唤祟物。 */
function advance(content: GameContent, card: CharacterLike, scenario: Scenario, state: SessionState, roller: Roller): GameEvent[] {
  const nextIndex = state.scene_index + 1
  if (nextIndex >= scenario.scenes.length) return finalize(content, card, scenario, state, roller)
  state.scene_index = nextIndex
  state.summon = null
  state.ward = 0
  const next = scenario.scenes[nextIndex]
  const events = [event('scene', `${next.place ?? ''}｜${next.name}`, 'info')]
  if (next.kind === 'combat') {
    const monster = next.enemy ? content.bestiary.byId.get(next.enemy) : undefined
    if (monster) {
      state.enemy = {
        id: monster.id,
        name: monster.name,
        element: monster.element,
        hp: Math.trunc(Number(monster.hp)),
        max_hp: Math.trunc(Number(monster.hp)),
        boost: 0,
      }
      state.round = 0
      state.corruption += 3
      events.push(event('encounter', `遭遇：${monster.name}（${monster.element}）——${monster.lore}`, 'error', {
        monster: monster.id,
      }))
    }
  } else if (next.kind === 'ending') {
    events.push(...finalize(content, card, scenario, state, roller))
  }
  return events
}

function kpTick(roller: Roller, state: SessionState, inCombat: boolean): GameEvent[] {
  const result = kp.event(roller, state.corruption, inCombat)
  if (!result) return []
  const effect = result.effect
  const events = [event('kp', '【KP】' + result.text, result.severity, { kp: result.id })]

  if (effect.corruption) state.corruption += Math.trunc(Number(effect.corruption))
  if (effect.san) {
    const loss = roller.roll(String(effect.san)).total
    state.san -= loss
    events.push(event('san', `理智 −${loss}。`, 'warn'))
  }
  if (effect.clue && !state.clues.includes(effect.clue)) {
    state.clues.push(effect.clue)
    events.push(event('clue', '线索入档：' + effect.clue, 'good'))
  }
  if (effect.enemy_boost && state.enemy) {
    state.enemy.boost = Math.trunc(Number(state.enemy.boost ?? 0)) + 1
    state.enemy.hp = Math.min(state.enemy.max_hp, state.enemy.hp + 4)
  }
  return events
}

// ---------------------------------------------------------------- 战斗

const ATTACKS: Record<string, any> = {
  'attack:melee': {
    label: '贴身强攻', skill: 'melee', damage: '1d8', scale: 'str',
    div: 4, type: 'physical', element: null, mp: 0, jianyi: 0, shaqi: 0,
  },
  'attack:spell': {
    label: '法术直取', skill: 'spell', damage: '2d6', scale: 'wil',
    div: 3, type: 'spell', element: 'self', mp: 3, jianyi: 0, shaqi: 0,
  },
  'attack:blade': {
    label: '御剑', skill: 'blade', damage: '2d6', scale: 'wil',
    div: 3, type: 'spell', element: '金', mp: 0, jianyi: 2, shaqi: 0,
  },
  'attack:hidden': {
    label: '暗器出手', skill: 'hidden', damage: '1d6+2', scale: 'agi',
    div: 4, type: 'physical', element: null, mp: 0, jianyi: 0, shaqi: 2,
  },
}

function pay(state: SessionState, spec: any): boolean {
  if (state.mp < Number(spec.mp ?? 0)) return false
  if (state.jianyi < Number(spec.jianyi ?? 0)) return false
  if (state.shaqi < Number(spec.shaqi ?? 0)) return false
  state.mp -= Number(spec.mp ?? 0)
  state.jianyi -= Number(spec.jianyi ?? 0)
  state.shaqi -= Number(spec.shaqi ?? 0)
  return true
}

function summonBonus(state: SessionState): number {
  if (!state.summon) return 0
  return Number(state.summon.force ?? 0) / 100
}

/** 一次攻击的完整结算：命中 → 伤害 → 五行 → 形态门槛。 */
function strike(
  content: GameContent,
  card: CharacterLike,
  state: SessionState,
  roller: Roller,
  skillId: string,
  damageDice: string,
  scaleKey: string,
  div: number,
  dtype: string,
  element: string | null,
) {
  const enemy = state.enemy!
  const monster = content.bestiary.byId.get(enemy.id) as Monster
  const phase = phaseFor(monster, enemy.hp)

  const target = skillValue(card, skillId, deps(content)) + checkModifier(element, enemy.element)
  const result = resolve(roller, SKILLS[skillId][0], target, 0, '', '攻击')

  const out: any = { result, hit: result.success, damage: 0, notes: [] as string[], roll: null as any }
  if (!result.success) {
    out.notes.push(result.level !== '大失败' ? '没打中。' : '手一抖，反而被它抓住了空档。')
    if (result.level === '大失败') state.san -= 1
    return out
  }

  const roll = roller.roll(damageDice, '伤害')
  let base = roll.total + Math.floor(Number(card.attrs?.[scaleKey] ?? 10) / div)
  const items = effectsOf(card, content.shop)
  base += Number(items.damage_vs[enemy.element] ?? 0) + Number(items.damage_flat)
  const mult = multiplier(element, enemy.element)
  const gate = stateGate(phase.state, dtype)
  const summon = 1.0 + summonBonus(state)
  let raw = base * mult * gate * summon
  if (result.level === '大成功') raw *= 2
  const damage = Math.max(0, Math.trunc(pyRound(raw)))

  if (mult > 1) out.notes.push(describeWuxing(element, enemy.element))
  if (gate === 0) out.notes.push(`${phase.state}之下，这种打法根本碰不到它。`)
  else if (gate < 1) out.notes.push(`${phase.state}，伤害被宿主分掉了一半。`)

  enemy.hp = Math.max(0, enemy.hp - damage)
  out.damage = damage
  out.roll = roll
  out.phase = phase.state
  return out
}

function doCombat(
  content: GameContent,
  card: CharacterLike,
  scenario: Scenario,
  state: SessionState,
  actionId: string,
  roller: Roller,
): GameEvent[] {
  const [head, arg = ''] = actionId.split(':')
  let events: GameEvent[] = []

  if (head === 'flee') return doFlee(content, card, scenario, state, roller)

  if (head === 'ward') {
    if (state.mp < 2) return [event('warn', '灵力不够结界的。', 'warn')]
    state.mp -= 2
    state.ward = 3
    return [event('ward', '戊土之气贴地而起，结界成形（三回合减伤）。', 'good')]
  }

  if (head === 'summon') return doSummon(content, card, state, arg, roller)

  if (head === 'env') return doEnv(content, card, state, roller)

  if (head === 'talisman') {
    const talisman = content.talismans.byId.get(arg)
    if (!talisman) return [event('warn', '没有这种符。', 'warn')]
    if ((state.inventory[arg] ?? 0) <= 0) return [event('warn', '这张符已经用完了。', 'warn')]
    if (state.mp < talisman.use_cost) return [event('warn', '灵力不够引动这张符。', 'warn')]
    state.mp -= talisman.use_cost
    state.inventory[arg] -= 1
    if (state.inventory[arg] <= 0) delete state.inventory[arg]
    events.push(event('talisman', `引动「${talisman.name}」（${talisman.element}）`, 'info'))
    events.push(...resolveTalisman(content, card, state, talisman, roller))
  } else if (ATTACKS[actionId]) {
    const spec = ATTACKS[actionId]
    if (!pay(state, spec)) return [event('warn', '资源不够，这招发不出来。', 'warn')]
    const element = spec.element === 'self' ? card.element ?? null : spec.element
    events.push(event('attack', `你选择了「${spec.label}」。`, 'info'))
    const result = strike(content, card, state, roller, spec.skill, spec.damage, spec.scale, spec.div, spec.type, element)
    events.push(...strikeEvents(result))
  } else {
    return [event('warn', '战斗中做不了这个。', 'warn')]
  }

  // 敌方回合
  if (state.enemy && state.enemy.hp > 0) events.push(...enemyTurn(content, card, state, roller))
  if (state.enemy && state.enemy.hp <= 0) {
    state.enemy = null
    delete state.round
    events.push(event('clear', '它散了。空气里的那股凉意退得干干净净。', 'good'))
    events.push(...advance(content, card, scenario, state, roller))
  }
  events.push(...forceReveal(content, state))
  events.push(...kpTick(roller, state, true))
  return events
}

/** 打不动它，就得逼它现形：每三回合它退一阶形态。 */
function forceReveal(content: GameContent, state: SessionState): GameEvent[] {
  const enemy = state.enemy
  if (!enemy) return []
  state.round = Number(state.round ?? 0) + 1
  if (state.round % 3) return []

  const monster = content.bestiary.byId.get(enemy.id) as Monster
  const phases = monster.phases
  const index = phaseIndex(monster, enemy.hp)
  if (index >= phases.length - 1) return []

  const total = enemy.max_hp
  const target = phases.length === 3
    ? Math.trunc(total * (index === 0 ? 0.59 : 0.29))
    : Math.trunc(total * 0.44)
  enemy.hp = Math.min(enemy.hp, Math.max(1, target))
  state.corruption += 2
  return [
    event('reveal', '你缠了它这么久，它的边缘开始发虚——被你逼得退了一阶形态。', 'good'),
    event('corruption', '阴浊 +2。跟它耗着的每一秒都在往你身上渗。', 'warn'),
  ]
}

function strikeEvents(result: any): GameEvent[] {
  const events = [event('check', describe(result.result), result.result.success ? 'good' : 'warn', {
    check: asDict(result.result),
  })]
  for (const note of result.notes) events.push(event('note', note, 'info'))
  if (result.hit) {
    events.push(event('damage', `造成 ${result.damage} 点伤害。`, result.damage > 0 ? 'good' : 'warn'))
  }
  return events
}

function resolveTalisman(
  content: GameContent,
  card: CharacterLike,
  state: SessionState,
  talisman: Talisman,
  roller: Roller,
): GameEvent[] {
  const events: GameEvent[] = []
  if (talisman.kind === 'damage') {
    const result = strike(content, card, state, roller, 'arcana', talisman.damage!, talisman.scale || 'wil', 3, 'talisman', talisman.element)
    events.push(...strikeEvents(result))
  } else if (talisman.kind === 'heal') {
    const amount = roller.roll(talisman.damage!).total + Math.floor(Number(card.attrs?.wil ?? 10) / 3)
    state.hp += amount
    events.push(event('heal', `气血回复 ${amount}。`, 'good'))
  } else if (talisman.kind === 'ward') {
    state.ward = Math.max(state.ward, 3)
    events.push(event('ward', '结界成形，三回合内减伤。', 'good'))
  } else if (talisman.kind === 'reveal') {
    const enemy = state.enemy
    if (enemy) {
      const monster = content.bestiary.byId.get(enemy.id) as Monster
      const phase = phaseFor(monster, enemy.hp)
      events.push(event('reveal', `净秽之下，它的形态清楚了：${phase.label}。`, 'good'))
      enemy.hp = Math.max(0, enemy.hp - 2)
    }
  } else if (talisman.kind === 'calm') {
    state.san = Math.min(state.san_max, state.san + 4)
    events.push(event('calm', '安神符压住了那阵耳鸣，理智 +4。', 'good'))
  } else if (talisman.kind === 'control') {
    const enemy = state.enemy
    if (enemy) {
      const monster = content.bestiary.byId.get(enemy.id) as Monster
      const phase = phaseFor(monster, enemy.hp)
      if (phase.state === '实体') {
        enemy.stunned = 1
        events.push(event('control', '定身符贴中，它定在原地。', 'good'))
      } else {
        events.push(event('note', `它是${phase.state}，符纸直接穿了过去。`, 'warn'))
      }
    }
  }
  return events
}

function doSummon(content: GameContent, card: CharacterLike, state: SessionState, spiritId: string, _roller: Roller): GameEvent[] {
  const spirit = content.spirits.byId.get(spiritId)
  if (!spirit) return [event('warn', '叫不来这位。', 'warn')]
  const cardRank = String(card.rank ?? '初真')
  if (RANKS.indexOf(spirit.rank as (typeof RANKS)[number]) > RANKS.indexOf(cardRank as (typeof RANKS)[number])) {
    return [event('warn', '你的箓职还不够请这位。', 'warn')]
  }
  const approval = Number(card.approval?.[spiritId] ?? 0)
  const discount = Math.trunc(Number(effectsOf(card, content.shop).summon_discount))
  const cost = Math.max(1, approvalCost(spirit, approval) - discount)
  if (state.mp < cost) return [event('warn', '灵力不够请神。', 'warn')]

  state.mp -= cost
  const ratio = 0.4 + (0.6 * Math.max(0, Math.min(100, approval))) / 100
  state.summon = {
    id: spiritId,
    name: spirit.name,
    approval,
    turns: 3,
    force: pyRound(Number(spirit.panel['武力'] ?? 0) * ratio),
    ward: pyRound((Number(spirit.panel['道法'] ?? 0) * ratio) / 100, 2),
  }
  state.ward = Math.max(state.ward, 3)
  return [
    event('summon', `${spirit.name} 上身。你听见自己的声音里混了别人的口音。`, 'good', { spirit: spiritId }),
    event('note', `能力继承 ${pyRound(ratio * 100)}%，持续三回合。`, 'info'),
  ]
}

function doEnv(content: GameContent, card: CharacterLike, state: SessionState, roller: Roller): GameEvent[] {
  const target = skillValue(card, 'investigate', deps(content))
  const result = resolve(roller, '侦查', target, 0, '', '借环境')
  const events = [event('check', describe(result), result.success ? 'good' : 'warn')]
  if (!result.success) return events

  const enemy = state.enemy!
  const monster = content.bestiary.byId.get(enemy.id) as Monster
  const phase = phaseFor(monster, enemy.hp)
  const options: Record<string, [string, number]> = {
    灵体: ['你摸到墙上的总闸，一把拉下。整层陷入黑暗，它的轮廓反而淡了。', 4],
    附身: ['你砸开消防栓，水压把附着的那面墙冲得裂开，它的根断了。', 6],
    实体: ['你抄起墙角的灭火器，干粉糊了它一脸。', 5],
  }
  const [text, bonus] = options[phase.state] ?? ['你抓住了一个稍纵即逝的空档。', 3]
  enemy.hp = Math.max(0, enemy.hp - bonus)
  events.push(event('env', text + `（造成 ${bonus} 点伤害）`, 'good'))
  return events
}

function doFlee(content: GameContent, card: CharacterLike, scenario: Scenario, state: SessionState, roller: Roller): GameEvent[] {
  const target = skillValue(card, 'athletics', deps(content))
  const result = resolve(roller, '身法', target, 0, '', '脱离')
  const events = [event('check', describe(result), result.success ? 'good' : 'warn')]
  if (result.success) {
    events.push(event('flee', '你退了出来。代价是这一趟的记录不好看。', 'warn'))
    state.corruption += 6
    state.enemy = null
    events.push(...advance(content, card, scenario, state, roller))
  } else {
    events.push(event('flee', '你没跑掉。', 'error'))
    events.push(...enemyTurn(content, card, state, roller))
  }
  return events
}

function enemyTurn(content: GameContent, card: CharacterLike, state: SessionState, roller: Roller): GameEvent[] {
  const enemy = state.enemy
  if (!enemy) return []
  if (enemy.stunned) {
    enemy.stunned = 0
    return [event('note', '它还在挣扎，这一回合动不了。', 'info')]
  }

  const monster = content.bestiary.byId.get(enemy.id) as Monster
  const phase = phaseFor(monster, enemy.hp)
  const attack = phase.attack

  const skillId = attack.type === 'spirit' ? 'resist' : 'athletics'
  const target = skillValue(card, skillId, deps(content)) + 10 * Number(enemy.boost ?? 0)
  const result = resolve(roller, SKILLS[skillId][0], target, 0, '', attack.name)
  const events = [event('check', describe(result), result.success ? 'good' : 'error')]
  if (result.success) {
    events.push(event('note', `你避开了：「${attack.name}」落空。`, 'info'))
    return events
  }

  const roll = roller.roll(attack.dice, attack.name)
  let damage = roll.total + Number(enemy.boost ?? 0) * 2
  if (state.ward > 0) {
    damage = Math.floor(damage / 2)
    state.ward = Math.max(0, state.ward - 1)
  }
  damage = Math.max(0, Math.trunc(damage))
  state.hp -= damage
  events.push(event('hurt', `${attack.name}｜${attack.text ?? ''} 落在你身上，气血 −${damage}。`, 'error', { damage }))

  if (attack.san) {
    const loss = roller.roll(String(attack.san).split('/').pop()!).total
    state.san -= loss
    events.push(event('san', `理智 −${loss}。`, 'warn'))
  }

  if (state.hp <= 0) events.push(event('down', '你倒下了。', 'error'))
  return events
}

// ---------------------------------------------------------------- 抉择与结算

function doChoice(
  content: GameContent,
  card: CharacterLike,
  scenario: Scenario,
  state: SessionState,
  scene: Scene,
  choiceId: string,
  roller: Roller,
): GameEvent[] {
  const choice = (scene.choices ?? []).find((item) => item.id === choiceId)
  if (!choice) return [event('warn', '没有这个选项。', 'warn')]

  state.karma.push({ id: choice.id, karma: choice.karma ?? '' })
  state.merit_delta = Number(state.merit_delta ?? 0) + Number(choice.merit ?? 0)
  state.corruption += Number(choice.corruption ?? 0)

  const events = [event('choice', choice.text, 'info')]
  events.push(event(
    'karma',
    `因果记为「${choice.karma ?? '未定'}」，功德 ${signed(Number(choice.merit ?? 0))}，阴浊 ${signed(Number(choice.corruption ?? 0))}。`,
    Number(choice.merit ?? 0) > 0 ? 'good' : 'warn',
  ))
  events.push(...advance(content, card, scenario, state, roller))
  return events
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`
}

function finalize(content: GameContent, card: CharacterLike, scenario: Scenario, state: SessionState, _roller: Roller): GameEvent[] {
  state.status = DONE
  state.enemy = null

  let grade: 'good' | 'neutral' | 'bad'
  let reason: string
  if (state.hp <= 0) {
    grade = 'bad'
    reason = '气血耗尽，你没能活着出来。'
  } else {
    const score =
      state.clues.length * 5 +
      Number(state.merit_delta ?? 0) -
      Math.floor(state.corruption / 4) -
      Math.floor((state.hp_max - state.hp) / 5)
    if (score >= 24) grade = 'good'
    else if (score >= 8) grade = 'neutral'
    else grade = 'bad'
    reason = `线索 ${state.clues.length} 条，功德 ${signed(Number(state.merit_delta ?? 0))}，阴浊 ${state.corruption}。`
  }

  const baseAward = { good: 8, neutral: 4, bad: 1 }[grade]
  const award = Math.max(0, baseAward + Number(state.merit_delta ?? 0))
  state.ending = {
    grade,
    reason,
    text: scenario.endings?.[grade] ?? '案子结了。',
    merit_award: award,
    clues: state.clues.length,
    karma: state.karma.map((item) => item.karma ?? ''),
  }
  const label = { good: '善了', neutral: '了结', bad: '未了' }[grade]
  return [
    event('ending', `结案：${label}`, grade === 'good' ? 'good' : 'warn', { grade }),
    event('story', state.ending.text, 'info'),
    event('note', reason, 'info'),
    event('merit', `本场记功德 +${award}。`, 'good', { award }),
  ]
}
