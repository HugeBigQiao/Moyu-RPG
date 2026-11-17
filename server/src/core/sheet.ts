/**
 * 角色卡计算。
 *
 * 职责：
 *     六维、衍生资源、技能值、特性与业障的汇总计算。
 * 为什么需要：
 *     同一张卡在列表、详情、战斗里必须算出同一组数；数值公式也只有这一份。
 * 上下游：
 *     上游：content/traits、content/shop；下游：core/session、core/npc、core/progress、api。
 */
import { effectsOf, type ShopIndex } from '../content/shop.ts'
import type { CharacterLike, DerivedStats, TraitSpec } from './types.ts'
import { pyRound } from './python.ts'

export interface SchoolSpec {
  name: string
  short: string
  mp_attr: string
  tagline: string
  bonus: Record<string, number>
}

export const SCHOOLS: Record<string, SchoolSpec> = {
  fulu: {
    name: '符箓派',
    short: '符',
    mp_attr: 'int',
    tagline: '门槛低，靠提前画符与请神，临场爆发看准备',
    bonus: { arcana: 15, spell: 5 },
  },
  neidan: {
    name: '内丹派',
    short: '丹',
    mp_attr: 'wil',
    tagline: '纯修自身，法术最强也最脆，怕近身',
    bonus: { spell: 15, wuxing: 10 },
  },
  guti: {
    name: '体修',
    short: '体',
    mp_attr: 'con',
    tagline: '炼体，靠气血硬扛，气血归零即昏迷',
    bonus: { melee: 15, athletics: 10 },
  },
  jianxiu: {
    name: '剑修',
    short: '剑',
    mp_attr: 'wil',
    tagline: '兵器一脉，剑意驱动，兵毁则战力崩',
    bonus: { blade: 20, athletics: 5 },
  },
  anqi: {
    name: '暗器',
    short: '暗',
    mp_attr: 'agi',
    tagline: '杀气蓄爆，被近身就废一半',
    bonus: { hidden: 20, investigate: 5 },
  },
}

export const ATTRS: Record<string, string> = {
  str: '力',
  agi: '敏',
  con: '体',
  int: '智',
  wil: '意',
  per: '感',
}

export const SKILLS: Record<string, [string, string]> = {
  arcana: ['符咒学', 'int'],
  spell: ['法术', 'wil'],
  melee: ['体术', 'str'],
  blade: ['御剑', 'wil'],
  hidden: ['暗器', 'agi'],
  athletics: ['身法', 'agi'],
  investigate: ['侦查', 'per'],
  wuxing: ['五行感应', 'per'],
  resist: ['精神抵抗', 'wil'],
  persuade: ['话术', 'wil'],
}

export const RANKS = ['初真', '盟威', '五雷', '天师'] as const

export interface SheetDeps {
  traits: Record<string, TraitSpec>
  shop: ShopIndex
}

function attr(character: CharacterLike, key: string): number {
  return Math.trunc(Number(character.attrs?.[key] ?? 10))
}

export function traitSum(character: CharacterLike, key: string, traits: Record<string, TraitSpec>): number {
  let total = 0
  for (const trait of character.traits ?? []) {
    const name = typeof trait === 'string' ? trait : trait?.name
    const spec = name ? traits[name] : undefined
    if (spec) total += Math.trunc(Number(spec.effect?.[key] ?? 0))
  }
  return total
}

export function schoolOf(character: CharacterLike): SchoolSpec {
  return SCHOOLS[character.school ?? 'fulu'] ?? SCHOOLS.fulu
}

export function karmaPenalty(character: CharacterLike): number {
  /** 业障：每层让所有检定 −10。 */
  return 10 * Math.trunc(Number(character.karma_debt ?? 0) || 0)
}

export function skillValue(character: CharacterLike, skillId: string, deps: SheetDeps): number {
  const spec = SKILLS[skillId]
  if (!spec) throw new Error(`没有这个技能：${skillId}`)
  const [, attrKey] = spec
  const base = attr(character, attrKey) * 5
  let bonus = Math.trunc(Number(schoolOf(character).bonus?.[skillId] ?? 0))
  bonus += traitSum(character, skillId, deps.traits)
  bonus += Math.trunc(Number(character.skill_bonus?.[skillId] ?? 0))
  bonus += Math.trunc(Number(effectsOf(character, deps.shop).skill[skillId] ?? 0))
  bonus -= karmaPenalty(character)
  return Math.max(1, Math.min(99, base + bonus))
}

/** 把一张卡的全部衍生数值算出来。 */
export function derived(character: CharacterLike, deps: SheetDeps): DerivedStats {
  const school = schoolOf(character)
  const mpAttr = school.mp_attr
  const con = attr(character, 'con')
  const intel = attr(character, 'int')
  const wil = attr(character, 'wil')
  const agi = attr(character, 'agi')

  const hpMax = con * 5 + traitSum(character, 'hp', deps.traits)
  const mpMax = attr(character, mpAttr) * 2 + traitSum(character, 'mp', deps.traits)
  const effects = effectsOf(character, deps.shop)
  let sanMax = Math.max(10, wil * 5 + traitSum(character, 'san', deps.traits))
  sanMax += Math.trunc(Number(effects.san_max))

  const schoolKey = character.school
  const jianyiMax = schoolKey === 'jianxiu' || schoolKey === 'neidan' ? wil * 2 : wil
  const shaqiMax = schoolKey === 'anqi' ? agi * 2 : agi
  const rank = character.rank ?? '初真'
  const rankIndex = RANKS.indexOf(rank as (typeof RANKS)[number])

  const skills: Record<string, number> = {}
  for (const skillId of Object.keys(SKILLS)) skills[skillId] = skillValue(character, skillId, deps)

  return {
    hp_max: Math.max(1, hpMax),
    mp_max: Math.max(1, mpMax),
    san_max: sanMax,
    jianyi_max: jianyiMax,
    shaqi_max: shaqiMax,
    mp_source: ATTRS[mpAttr],
    agility: agi + traitSum(character, 'agility', deps.traits),
    initiative: agi * 2 + traitSum(character, 'agility', deps.traits) * 2,
    rank_index: rankIndex,
    can_summon: rankIndex >= 1,
    summon_bonus: traitSum(character, 'summon', deps.traits),
    merit: Math.trunc(Number(character.merit ?? 0)) + traitSum(character, 'merit', deps.traits),
    karma_penalty: karmaPenalty(character),
    karma_debt: Math.trunc(Number(character.karma_debt ?? 0) || 0),
    draw_pool: Math.max(1, intel * 2 + Math.trunc(Number(effects.draw_pool))),
    summon_discount: Math.trunc(Number(effects.summon_discount)),
    skills,
  }
}

export function displayAttrs(character: CharacterLike) {
  return Object.entries(ATTRS).map(([key, label]) => {
    const value = attr(character, key)
    return {
      key,
      label,
      value,
      pct: pyRound((value / 18) * 100),
      tier: value >= 15 ? 'high' : value >= 10 ? 'mid' : 'low',
    }
  })
}
