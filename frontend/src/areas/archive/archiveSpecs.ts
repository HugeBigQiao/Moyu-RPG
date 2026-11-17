/**
 * 档案编辑器的字段规格。
 *
 * 职责：
 *     定义 11 类档案「能改哪些字段、用什么控件、必填与否」，以及表单值与接口 payload 的互转。
 * 为什么需要：
 *     字段表是数据不是逻辑；放组件里会让模板被 v-if 淹没，而后端 edit.py 的校验口径
 *     要和这里对得上，两份放在一起才好一起改。
 * 上下游：
 *     上游：areas/archive/ArchiveView.vue（列表与选中）、areas/archive/ArchiveEditor.vue（表单）；
 *     下游：shared/types.ts（ArchiveKind / FieldOption）、后端 content/edit.py（字段白名单）。
 */

import type {
  ArchiveItem,
  ArchiveKind,
  FieldOption,
  MissionsPayload,
  ScenarioPayload,
  TraitsPayload,
  WorldData
} from '../../shared/types'

/** 控件类型：决定 ArchiveEditor 用哪种输入方式渲染。 */
export type FieldType = 'text' | 'id' | 'textarea' | 'number' | 'select' | 'tags' | 'list' | 'strmap' | 'nummap'

/** list 类型的子字段（城市「当地势力」那种一行多个输入框）。 */
export interface SubField {
  key: string
  label: string
  type?: 'text' | 'select'
  options?: FieldOption[]
  width?: number
  flex?: boolean
}

/** 一个字段的完整描述；同一个属性在不同类型下有不同含义（见注释）。 */
export interface FieldSpec {
  key: string
  label: string
  type: FieldType
  required?: boolean
  /** 只在新增时可填，编辑时只读（如 id、特性名） */
  createOnly?: boolean
  wide?: boolean
  hint?: string
  placeholder?: string
  /** 文本是最大长度，数字是上限 */
  max?: number
  /** 数字的下限 */
  min?: number
  step?: number
  rows?: number
  default?: string | number
  /** 下拉选项来源：tiers / nations / industries / missions / traits / scenarios ... */
  source?: string
  options?: FieldOption[]
  itemFields?: SubField[]
  keySource?: string
  keySuggestions?: string[]
  keyLabel?: string
  valueLabel?: string
  showIf?: { key: string; in: Array<string | number> }
}

/** 一类档案的完整规格。 */
export interface ArchiveSpec {
  label: string
  idField: 'id' | 'name'
  hint: string
  fields: FieldSpec[]
}

/** optionGroups 认的输入：只有这些接口数据参与拼下拉。 */
export interface OptionSources {
  world?: WorldData
  missions?: MissionsPayload
  traits?: TraitsPayload
  scenarios?: ScenarioPayload
}

// 静态下拉：值的类型要和 content JSON 里的类型一致（grade/tier 是数字，其余是字符串）
const GRADES = [
  { value: 1, label: '甲等' },
  { value: 2, label: '乙等' },
  { value: 3, label: '丙等' },
  { value: 4, label: '丁等' }
]

const ELEMENTS = ['金', '木', '水', '火', '土'].map(v => ({ value: v, label: v }))
const SCOPES = [
  { value: 'general', label: '通用（哪里都能长）' },
  { value: 'mission', label: '限定任务' }
]
const MISSION_KINDS = [
  { value: 'fixed', label: '固定任务' },
  { value: 'random', label: '随机任务模板' }
]
const FACTION_KINDS = ['机构', '教派', '企业', '民间', '其他'].map(v => ({ value: v, label: v }))
const EQUIPMENT_KINDS = ['法器', '阴器', '耗材', '护具'].map(v => ({ value: v, label: v }))

// 特性效果的常用键：和 engine/sheet.py 里 trait_sum 用的键对齐
const EFFECT_KEYS = [
  'hp', 'mp', 'san', 'merit', 'summon', 'agility',
  'arcana', 'spell', 'melee', 'blade', 'hidden',
  'athletics', 'investigate', 'wuxing', 'resist', 'persuade'
]

export const SPECS: Record<ArchiveKind, ArchiveSpec> = {
  cities: {
    label: '城市',
    idField: 'id',
    hint: '城市会落到世界地图上；等级决定它能带多少条出身事件。',
    fields: [
      { key: 'id', label: 'ID', type: 'id', required: true, createOnly: true,
        hint: '小写英文，创建后不可改（地图与人物都按它关联）' },
      { key: 'name', label: '城市名', type: 'text', required: true, max: 12 },
      { key: 'tier', label: '城市等级', type: 'select', source: 'tiers', required: true },
      { key: 'nation', label: '所属国家', type: 'select', source: 'nations', required: true },
      { key: 'pop', label: '人口（万）', type: 'number', min: 1, max: 5000, default: 100 },
      { key: 'blurb', label: '简介', type: 'textarea', wide: true, rows: 3 },
      { key: 'industries', label: '行业底色', type: 'tags', source: 'industries', required: true },
      { key: 'landmarks', label: '地标', type: 'tags', hint: '回车添加，可自由写' },
      { key: 'lat', label: '纬度', type: 'number', min: -90, max: 90, step: 0.01, default: 35 },
      { key: 'lon', label: '经度', type: 'number', min: -180, max: 180, step: 0.01, default: 105 },
      {
        key: 'factions', label: '当地势力', type: 'list', wide: true,
        itemFields: [
          { key: 'kind', label: '类型', type: 'select', options: FACTION_KINDS, width: 90 },
          { key: 'name', label: '名称', type: 'text', width: 160 },
          { key: 'note', label: '说明', type: 'text', flex: true }
        ],
        hint: '在地图上点开这座城市时，显示的就是这几条'
      }
    ]
  },

  figures: {
    label: '人物',
    idField: 'id',
    hint: '人物是设定里的人，不是玩家角色；他们出现在城市势力与剧情钩子里。',
    fields: [
      { key: 'id', label: 'ID', type: 'id', required: true, createOnly: true },
      { key: 'name', label: '姓名', type: 'text', required: true, max: 20 },
      { key: 'title', label: '身份', type: 'text', max: 60 },
      { key: 'org', label: '所属', type: 'text', max: 40 },
      { key: 'element', label: '本命五行', type: 'select', options: ELEMENTS, required: true },
      { key: 'blurb', label: '简介', type: 'textarea', wide: true, rows: 3 },
      { key: 'hook', label: '钩子', type: 'textarea', wide: true, rows: 2 }
    ]
  },

  agencies: {
    label: '机构',
    idField: 'id',
    hint: '官方机构：玩家的单位、评级方、开通行证的人。',
    fields: [
      { key: 'id', label: 'ID', type: 'id', required: true, createOnly: true },
      { key: 'name', label: '名称', type: 'text', required: true, max: 20 },
      { key: 'mandate', label: '职权', type: 'text', max: 60 },
      { key: 'authority', label: '具体权限', type: 'text', max: 200 },
      { key: 'blurb', label: '简介', type: 'textarea', wide: true, rows: 3 },
      { key: 'relation', label: '与其他机构的关系', type: 'textarea', wide: true, rows: 2 }
    ]
  },

  sects: {
    label: '教派',
    idField: 'id',
    hint: '教派之间是张关系网：右边填「对象 id → 态度」，档案页会显示成中文名。',
    fields: [
      { key: 'id', label: 'ID', type: 'id', required: true, createOnly: true },
      { key: 'name', label: '名称', type: 'text', required: true, max: 20 },
      { key: 'tradition', label: '路数', type: 'text', max: 40 },
      { key: 'resource', label: '资源', type: 'text', max: 40 },
      { key: 'doctrine', label: '宗旨', type: 'textarea', wide: true, rows: 2 },
      { key: 'blurb', label: '简介', type: 'textarea', wide: true, rows: 3 },
      {
        key: 'relations', label: '与其他势力的关系', type: 'strmap', wide: true,
        keySource: 'relationTargets', keyLabel: '对象', valueLabel: '态度',
        hint: '对象可以是教派、国家或国家机构；态度自由写（如「敌对」）'
      }
    ]
  },

  industries: {
    label: '行业',
    idField: 'id',
    hint: '行业是平等的，规模与风险都是 1–5。',
    fields: [
      { key: 'id', label: 'ID', type: 'id', required: true, createOnly: true },
      { key: 'name', label: '名称', type: 'text', required: true, max: 20 },
      { key: 'scale', label: '规模', type: 'number', min: 1, max: 5, default: 3 },
      { key: 'risk', label: '风险', type: 'number', min: 1, max: 5, default: 3 },
      { key: 'blurb', label: '说明', type: 'textarea', wide: true, rows: 3 }
    ]
  },

  nations: {
    label: '国家',
    idField: 'id',
    hint: '国家决定城市的归属，也决定官方对祟物的态度。',
    fields: [
      { key: 'id', label: 'ID', type: 'id', required: true, createOnly: true },
      { key: 'name', label: '名称', type: 'text', required: true, max: 20 },
      { key: 'era', label: '时代', type: 'text', max: 40 },
      { key: 'gov', label: '体制', type: 'text', max: 200 },
      { key: 'blurb', label: '简介', type: 'textarea', wide: true, rows: 3 },
      { key: 'stance', label: '对祟物的态度', type: 'textarea', wide: true, rows: 2 }
    ]
  },

  lore: {
    label: '世界背景',
    idField: 'id',
    hint: '世界背景是按条目写的说明文（时代、祟物、代价……）。',
    fields: [
      { key: 'id', label: 'ID', type: 'id', required: true, createOnly: true },
      { key: 'title', label: '标题', type: 'text', required: true, max: 40 },
      { key: 'body', label: '正文', type: 'textarea', wide: true, rows: 6 }
    ]
  },

  events: {
    label: '事件',
    idField: 'id',
    hint: '事件是人物的来路：甲、乙级要挂在具体任务上，丙、丁级到处都能长。',
    fields: [
      { key: 'id', label: 'ID', type: 'id', required: true, createOnly: true },
      { key: 'name', label: '事件名', type: 'text', required: true, max: 30 },
      { key: 'grade', label: '等级', type: 'select', options: GRADES, required: true, default: 3 },
      { key: 'scope', label: '适用范围', type: 'select', options: SCOPES, required: true, default: 'general' },
      { key: 'missions', label: '限定任务', type: 'tags', source: 'missions', required: true,
        showIf: { key: 'scope', in: ['mission'] }, hint: '甲、乙级事件必须挂至少一个任务' },
      { key: 'industries', label: '关联行业', type: 'tags', source: 'industries' },
      { key: 'traits', label: '赋予特性', type: 'tags', source: 'traits', hint: '人物抽到这条事件时会带上这些特性' },
      { key: 'weight', label: '权重', type: 'number', min: 1, max: 100, default: 10,
        hint: '越大越常被抽到' },
      { key: 'text', label: '背景', type: 'textarea', wide: true, rows: 3 },
      { key: 'hook', label: '钩子', type: 'textarea', wide: true, rows: 2,
        hint: '这个人为什么牵涉进来' }
    ]
  },

  missions: {
    label: '任务',
    idField: 'id',
    hint: '固定任务要有剧本才能开局；剧本留空会自动生成一个能跑的占位剧本。',
    fields: [
      { key: 'id', label: 'ID', type: 'id', required: true, createOnly: true },
      { key: 'name', label: '任务名', type: 'text', required: true, max: 30 },
      { key: 'tier', label: '等级', type: 'number', min: 1, max: 4, default: 2 },
      { key: 'kind', label: '类型', type: 'select', options: MISSION_KINDS, required: true, default: 'fixed' },
      { key: 'cities', label: '发案城市', type: 'tags', source: 'cities', required: true },
      { key: 'scenario_id', label: '剧本', type: 'select', source: 'scenarios', placeholder: '（自动生成占位剧本）',
        hint: '想自己写剧本就改 backend/data/content/scenarios.json' },
      { key: 'blurb', label: '简介', type: 'textarea', wide: true, rows: 3 }
    ]
  },

  equipment: {
    label: '装备',
    idField: 'id',
    hint: '装备是档案里的物品条目；真正进战斗结算的是商店货（shop.json）。',
    fields: [
      { key: 'id', label: 'ID', type: 'id', required: true, createOnly: true },
      { key: 'name', label: '装备名', type: 'text', required: true, max: 20 },
      { key: 'kind', label: '类型', type: 'select', options: EQUIPMENT_KINDS, default: '法器' },
      { key: 'grade', label: '品级', type: 'select', options: GRADES, required: true, default: 3 },
      { key: 'price', label: '功德价', type: 'number', min: 0, max: 99999, default: 0 },
      { key: 'effect', label: '效果', type: 'text', max: 200 },
      { key: 'desc', label: '描述', type: 'textarea', wide: true, rows: 3 }
    ]
  },

  traits: {
    label: '特性',
    idField: 'name',
    hint: '特性名就是 id，建好之后不能改名（改名等于换一条特性）。',
    fields: [
      { key: 'name', label: '特性名', type: 'text', required: true, createOnly: true, max: 24 },
      { key: 'tier', label: '品级', type: 'select', options: GRADES, required: true, default: 3 },
      { key: 'desc', label: '描述', type: 'textarea', wide: true, rows: 3 },
      {
        key: 'effect', label: '数值效果', type: 'nummap', wide: true,
        keySuggestions: EFFECT_KEYS, keyLabel: '属性 / 技能', valueLabel: '数值',
        hint: '键要和 engine/sheet.py 的算法对得上：hp/mp/san/summon/agility 或技能 id'
      }
    ]
  }
}

/**
 * 把接口数据整理成下拉选项。
 * 参数：data = { world, events, missions, equipment, traits, scenarios }
 */
export function optionGroups(data: OptionSources): Record<string, FieldOption[]> {
  const world = data.world
  const cities = world?.cities || []
  const sects = world?.sects || []
  const nations = world?.nations || []
  const agencies = world?.agencies || []
  return {
    tiers: (world?.tiers || []).map(t => ({ value: t.key, label: `${t.name}（${t.max_events} 条事件）` })),
    nations: nations.map(n => ({ value: n.id, label: n.name })),
    industries: (world?.industries || []).map(i => ({ value: i.id, label: i.name })),
    cities: cities.map(c => ({ value: c.id, label: c.name })),
    missions: ((data.missions && data.missions.missions) || []).map(m => ({ value: m.id, label: m.name })),
    traits: ((data.traits && data.traits.traits) || []).map(t => ({ value: t.name, label: t.name })),
    scenarios: ((data.scenarios && data.scenarios.scenarios) || []).map(s => ({ value: s.id, label: s.name })),
    relationTargets: [
      ...sects.map(s => ({ value: s.id, label: `${s.name}（教派）` })),
      ...nations.map(n => ({ value: n.id, label: `${n.name}（国家）` })),
      ...agencies.map(a => ({ value: a.id, label: `${a.name}（机构）` }))
    ]
  }
}

// ---------------------------------------------------------------- 表单值

function defaultFor(field: FieldSpec): any {
  if (field.default !== undefined) return field.default
  if (field.type === 'number') return 0
  if (field.type === 'tags' || field.type === 'list' || field.type === 'strmap' || field.type === 'nummap') return []
  return ''
}

export function emptyForm(spec: ArchiveSpec): Record<string, any> {
  const form: Record<string, any> = {}
  for (const field of spec.fields) form[field.key] = defaultFor(field)
  return form
}

/** 接口条目 -> 表单值（对象型的字段拆成可编辑的行）。 */
export function itemToForm(spec: ArchiveSpec, item: ArchiveItem): Record<string, any> {
  const form = emptyForm(spec)
  for (const field of spec.fields) {
    const value = item[field.key]
    if (field.type === 'tags') {
      form[field.key] = Array.isArray(value) ? value.slice() : []
    } else if (field.type === 'list') {
      form[field.key] = Array.isArray(value) ? value.map(row => ({ ...row })) : []
    } else if (field.type === 'strmap' || field.type === 'nummap') {
      form[field.key] = Object.entries(value || {}).map(([key, val]) => ({ key, value: val }))
    } else if (field.type === 'number') {
      form[field.key] = Number(value ?? defaultFor(field))
    } else {
      form[field.key] = value ?? defaultFor(field)
    }
  }
  return form
}

/** 表单值 -> 接口 payload（把行还原成对象，数字转成数字）。 */
export function formToPayload(spec: ArchiveSpec, form: Record<string, any>): ArchiveItem {
  const payload: Record<string, any> = {}
  for (const field of spec.fields) {
    const value = form[field.key]
    if (field.type === 'strmap') {
      const out: Record<string, string> = {}
      for (const row of value || []) {
        const key = String(row.key || '').trim()
        const text = String(row.value || '').trim()
        if (key && text) out[key] = text
      }
      payload[field.key] = out
    } else if (field.type === 'nummap') {
      const out: Record<string, number> = {}
      for (const row of value || []) {
        const key = String(row.key || '').trim()
        if (!key) continue
        const num = Number(row.value)
        if (Number.isFinite(num)) out[key] = Math.trunc(num)
      }
      payload[field.key] = out
    } else if (field.type === 'number') {
      payload[field.key] = Number(value)
    } else if (field.type === 'tags') {
      payload[field.key] = (value || []).filter(Boolean)
    } else {
      payload[field.key] = value
    }
  }
  return payload
}

/** 保存后要选中的那条的 id：traits 用 name，其余用 id。 */
export function idOf(spec: ArchiveSpec, item: ArchiveItem): string {
  return String(item[spec.idField] ?? '')
}

/** 必填项检查：只做「空不空」，格式与引用交给后端统一报错。 */
export function missingRequired(spec: ArchiveSpec, payload: ArchiveItem): string[] {
  const empty: string[] = []
  for (const field of spec.fields) {
    if (!field.required) continue
    const value = payload[field.key]
    const isBlank = value === '' || value === undefined || value === null ||
      (Array.isArray(value) && value.length === 0)
    if (isBlank) empty.push(field.label)
  }
  return empty
}
