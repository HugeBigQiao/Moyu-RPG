/**
 * 旧版抽卡。
 *
 * 职责：
 *     按稀有度权重生成角色卡（接口保留，新流程用 npc）。
 * 为什么需要：
 *     早期版本靠它出卡；现在仍被 /api/gacha 使用，必须与旧数据同构。
 * 上下游：
 *     上游：sheet、dice、content/{traits,spirits}；下游：api/characters。
 */
import { createHash } from 'node:crypto'
import { ATTRS, RANKS } from './sheet.ts'
import { Roller, newSeed, roll4d6DropLowest } from './dice.ts'
import type { GameContent } from '../content/index.ts'
import { pyRound } from './python.ts'

const RARITIES = [
  { key: '凡', name: '凡品', weight: 50, bonus: 0, dice: '3d6', traits: 1, rank: '初真' },
  { key: '灵', name: '灵品', weight: 28, bonus: 0, dice: '4d6', traits: 2, rank: '盟威' },
  { key: '玄', name: '玄品', weight: 16, bonus: 2, dice: '4d6', traits: 2, rank: '五雷' },
  { key: '天', name: '天品', weight: 6, bonus: 4, dice: '4d6', traits: 3, rank: '天师' },
]

const RARITY_BY_KEY = Object.fromEntries(RARITIES.map((item) => [item.key, item]))

export const SCHOOL_FLOOR: Record<string, Record<string, number>> = {
  fulu: { int: 12, wil: 10 },
  neidan: { wil: 13, int: 10 },
  guti: { con: 13, str: 12 },
  jianxiu: { wil: 13, agi: 11 },
  anqi: { agi: 13, per: 11 },
}

export const SCHOOL_WEIGHTS: Record<string, number> = {
  fulu: 26,
  neidan: 22,
  guti: 20,
  jianxiu: 18,
  anqi: 14,
}

export const SURNAMES = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳'
export const GIVEN = [
  '昭', '衡', '玄', '澈', '晏', '衍', '砚', '珩', '澈', '准',
  '知微', '听雪', '望舒', '临川', '见山', '云归', '扶摇', '疏影',
  '既明', '长庚', '南枝', '清让', '无咎', '守拙', '怀瑾', '照野',
]

const SCHOOL_TITLES: Record<string, string[]> = {
  fulu: ['画符的', '走符箓的', '拿笔的'],
  neidan: ['炼丹的', '坐枯禅的', '修内景的'],
  guti: ['练拳的', '站桩的', '皮糙肉厚的'],
  jianxiu: ['背剑的', '使剑的', '剑匣不离身的'],
  anqi: ['玩暗器的', '袖里有东西的', '拈针的'],
}

const FLAVOR = [
  '档案里只有一行：此人来历不详，手续齐全。',
  '档案里只有一行：此人有师承，但师门名录对不上。',
  '档案里只有一行：此人曾独自处理过一起三级阴浊事件，未上报。',
  '档案里只有一行：此人不肯说自己第一次见祟是哪年。',
  '档案里只有一行：此人登记的法器数量超过规定，未解释。',
]

function code(seed: string): string {
  return 'nd-' + createHash('md5').update(seed, 'utf8').digest('hex').slice(0, 6)
}

function attrPool(roller: Roller, dice: string, bonus: number): Record<string, number> {
  const attrs: Record<string, number> = {}
  for (const key of Object.keys(ATTRS)) {
    const value = dice === '3d6'
      ? roller.pool(3, 6, '属性生成').reduce((a, b) => a + b, 0)
      : roll4d6DropLowest(roller)
    attrs[key] = Math.max(3, Math.min(20, value + bonus))
  }
  return attrs
}

export interface GachaCard {
  code: string
  name: string
  school: string
  element: string
  rarity: string
  rank: string
  merit: number
  attrs: Record<string, number>
  traits: Array<{ name: string; desc: string }>
  approval: Record<string, number>
  notes: string
  seed: string
  title: string
}

/** 抽一张卡，返回可以直接入库的 dict。 */
export function roll(content: GameContent, seed?: string): GachaCard {
  seed = seed || newSeed()
  const roller = new Roller(seed)

  const rarity = roller.weighted(RARITIES.map((item) => [item.key, item.weight] as const), '稀有度')
  const spec = RARITY_BY_KEY[rarity]
  const school = roller.weighted(Object.entries(SCHOOL_WEIGHTS), '流派')
  const attrs = attrPool(roller, spec.dice, spec.bonus)

  for (const [key, floor] of Object.entries(SCHOOL_FLOOR[school])) {
    if (attrs[key] < floor) attrs[key] = floor
  }

  const element = roller.choice(['金', '木', '水', '火', '土'], '本命五行')
  const traitPool = Object.keys(content.traits.traits).filter((name) => name !== '业障缠身')
  const traits = roller.sample(traitPool, spec.traits, '特性')
  const traitPayload = traits.map((name) => ({ name, desc: content.traits.traits[name].desc }))

  const name = roller.choice(Array.from(SURNAMES)) + roller.choice(GIVEN)
  const rank = spec.rank
  const merit = roller.randint(0, 20) + (rarity === '玄' || rarity === '天' ? 30 : 0)

  const approval: Record<string, number> = {}
  if (rank !== '初真') {
    const limit = RANKS.indexOf(rank as (typeof RANKS)[number])
    for (const spirit of content.spirits.spirits) {
      if (RANKS.indexOf(spirit.rank as (typeof RANKS)[number]) <= limit) {
        approval[spirit.id] = roller.randint(5, 45)
      }
    }
  }

  return {
    code: code(seed),
    name,
    school,
    element,
    rarity,
    rank,
    merit,
    attrs,
    traits: traitPayload,
    approval,
    notes: roller.choice(FLAVOR),
    seed,
    title: roller.choice(SCHOOL_TITLES[school]),
  }
}

export function rollMany(content: GameContent, count: number): GachaCard[] {
  return Array.from({ length: Math.max(1, Math.min(10, count)) }, () => roll(content))
}

export function rateTable() {
  const total = RARITIES.reduce((sum, item) => sum + item.weight, 0)
  return RARITIES.map((item) => ({ ...item, pct: pyRound((item.weight / total) * 100, 1) }))
}
