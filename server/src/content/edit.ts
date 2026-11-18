/**
 * 档案内容的增删改。
 *
 * 职责：
 *     按类别校验一条内容、写回对应的 JSON，并在删除前检查引用关系。
 * 为什么需要：
 *     档案页要能就地加城市、改任务、删教派；字段与校验口径只在这一个文件里定义。
 * 上下游：
 *     上游：api/archive-edit（已解析的 payload）、ContentStore；
 *     下游：write（原子写回）、plugins/content.reload。
 */
import type { Doc } from './index.ts'
import type { ContentStore } from './store.ts'
import { saveContentFiles } from './write.ts'

const KINDS: Record<string, { file: string; key: string; label: string }> = {
  nations: { file: 'world', key: 'nations', label: '国家' },
  sects: { file: 'world', key: 'sects', label: '教派' },
  agencies: { file: 'world', key: 'agencies', label: '国家机构' },
  figures: { file: 'world', key: 'figures', label: '人物' },
  industries: { file: 'world', key: 'industries', label: '行业' },
  cities: { file: 'world', key: 'cities', label: '城市' },
  lore: { file: 'world', key: 'lore', label: '世界背景' },
  events: { file: 'events', key: 'events', label: '事件' },
  missions: { file: 'missions', key: 'missions', label: '任务' },
  equipment: { file: 'equipment', key: 'equipment', label: '装备' },
  traits: { file: 'traits', key: 'traits', label: '人物特性' },
}

const ID_RE = /^[a-z][a-z0-9_]{1,31}$/
const SCOPES = ['general', 'mission']
const ELEMENTS = ['金', '木', '水', '火', '土']
const MISSION_KINDS = ['fixed', 'random']

export class EditError extends Error {}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export type ArchiveItem = Record<string, any>

/** 编辑器：内容层看不到数据库；数据库里的引用由接口层查好再传进来。 */
export class ContentEditor {
  private readonly store: ContentStore
  private readonly save: (documents: Record<string, Doc>) => void

  constructor(
    store: ContentStore,
    save?: (documents: Record<string, Doc>) => void,
  ) {
    this.store = store
    this.save = save ?? ((documents) => saveContentFiles(store, documents))
  }

  kinds(): Array<{ key: string; label: string }> {
    return Object.entries(KINDS).map(([key, meta]) => ({ key, label: meta.label }))
  }

  count(kind: string): number {
    return this.items(kind).length
  }

  items(kind: string): ArchiveItem[] {
    const meta = this.meta(kind)
    const doc = this.store.load<Doc>(meta.file)
    if (kind === 'traits') {
      return Object.entries(doc.traits ?? {}).map(([name, spec]) => ({ name, ...clone(spec as object) }))
    }
    return clone(doc[meta.key] ?? [])
  }

  find(kind: string, itemId: string): ArchiveItem | null {
    return this.items(kind).find((item) => this.idOf(kind, item) === itemId) ?? null
  }

  /** 新增一条，返回写进 JSON 的条目。 */
  create(kind: string, payload: ArchiveItem): ArchiveItem {
    const meta = this.meta(kind)
    const doc = clone(this.store.load<Doc>(meta.file))
    const itemId = this.newId(kind, payload, doc)
    let item = this.build(kind, payload, itemId, doc, null)

    const docs: Record<string, Doc> = { [meta.file]: doc }
    if (kind === 'missions') {
      const [prepared, scenarioDoc] = this.prepareScenario(item, this.store.load<Doc>('world'))
      item = prepared
      if (scenarioDoc) docs.scenarios = scenarioDoc
    }

    this.validate(kind, item, doc)
    this.put(kind, doc, item, null)
    this.save(docs)
    return this.public(kind, item)
  }

  /** 按 id 改一条，返回改完的条目。id 本身不可改。 */
  update(kind: string, itemId: string, payload: ArchiveItem): ArchiveItem {
    const meta = this.meta(kind)
    const doc = clone(this.store.load<Doc>(meta.file))
    const existing = this.findInDoc(kind, itemId, doc)
    if (existing === null) throw new EditError(`没有这条内容：${itemId}`)

    let item = this.build(kind, payload, itemId, doc, existing)
    const docs: Record<string, Doc> = { [meta.file]: doc }
    if (kind === 'missions') {
      const [prepared, scenarioDoc] = this.prepareScenario(item, this.store.load<Doc>('world'))
      item = prepared
      if (scenarioDoc) docs.scenarios = scenarioDoc
    }

    this.validate(kind, item, doc)
    this.put(kind, doc, item, existing)
    this.save(docs)
    return this.public(kind, item)
  }

  /** 删一条；被别的内容引用时拒绝，并说清是谁在引用。 */
  remove(kind: string, itemId: string, extraRefs: string[] = []): ArchiveItem {
    const meta = this.meta(kind)
    const doc = clone(this.store.load<Doc>(meta.file))
    const existing = this.findInDoc(kind, itemId, doc)
    if (existing === null) throw new EditError(`没有这条内容：${itemId}`)

    const refs = [...this.refs(kind, existing, doc), ...extraRefs.filter(Boolean)]
    if (refs.length) throw new EditError(`不能删「${this.title(kind, existing)}」：${refs.join('；')}`)

    const docs: Record<string, Doc> = { [meta.file]: doc }
    if (kind === 'traits') {
      delete doc.traits[itemId]
    } else {
      doc[meta.key] = (doc[meta.key] ?? []).filter((item: ArchiveItem) => this.idOf(kind, item) !== itemId)
    }
    if (kind === 'cities') {
      delete doc.city_geo?.[itemId]
      delete doc.city_factions?.[itemId]
    }
    if (kind === 'missions') {
      const scenarioDoc = this.dropStubScenario(itemId)
      if (scenarioDoc) docs.scenarios = scenarioDoc
    }

    this.save(docs)
    return existing
  }

  // ---------------------------------------------------------------- 元信息与定位

  private meta(kind: string) {
    const meta = KINDS[kind]
    if (!meta) throw new EditError(`没有这一类档案：${kind}`)
    return meta
  }

  private idOf(kind: string, item: ArchiveItem): string {
    return kind === 'traits' ? item.name : item.id ?? ''
  }

  private title(kind: string, item: ArchiveItem): string {
    if (kind === 'traits') return item.name
    if (kind === 'lore') return item.title || item.id || ''
    return item.name || item.id || ''
  }

  private public(kind: string, item: ArchiveItem): ArchiveItem {
    if (kind === 'traits') return { name: item.name, ...item.spec }
    return item
  }

  private findInDoc(kind: string, itemId: string, doc: Doc): ArchiveItem | null {
    if (kind === 'traits') {
      const spec = doc.traits?.[itemId]
      return spec ? { name: itemId, ...spec } : null
    }
    return (doc[KINDS[kind].key] ?? []).find((item: ArchiveItem) => item.id === itemId) ?? null
  }

  private newId(kind: string, payload: ArchiveItem, doc: Doc): string {
    if (kind === 'traits') {
      const name = reqStr(payload, 'name', '特性名', 24)
      if (name in (doc.traits ?? {})) throw new EditError(`已经有同名特性：${name}`)
      return name
    }
    const itemId = cleanId(payload.id)
    if (this.findInDoc(kind, itemId, doc) !== null) throw new EditError(`已经有同 id 的条目：${itemId}`)
    return itemId
  }

  private put(kind: string, doc: Doc, item: ArchiveItem, existing: ArchiveItem | null): void {
    if (kind === 'traits') {
      doc.traits[item.name] = item.spec
      return
    }
    if (kind === 'cities') {
      const geo = [item.lat, item.lon]
      const factions = item.factions
      delete item.lat
      delete item.lon
      delete item.factions
      doc.city_geo = doc.city_geo ?? {}
      doc.city_factions = doc.city_factions ?? {}
      doc.city_geo[item.id] = geo
      doc.city_factions[item.id] = factions
    }

    const bucket = doc[KINDS[kind].key] as ArchiveItem[]
    if (existing === null) {
      bucket.push(item)
      return
    }
    const index = bucket.findIndex((row) => row.id === item.id)
    if (index >= 0) bucket[index] = item
  }

  // ---------------------------------------------------------------- 各类型的组装

  private build(kind: string, payload: ArchiveItem, itemId: string, doc: Doc, existing: ArchiveItem | null): ArchiveItem {
    if (kind === 'nations') {
      return {
        id: itemId,
        name: reqStr(payload, 'name', '名称', 20),
        era: optStr(payload, 'era', '时代', 40),
        gov: optStr(payload, 'gov', '体制', 200),
        blurb: optStr(payload, 'blurb', '简介', 1200),
        stance: optStr(payload, 'stance', '对祟物的态度', 300),
      }
    }
    if (kind === 'sects') {
      return {
        id: itemId,
        name: reqStr(payload, 'name', '名称', 20),
        tradition: optStr(payload, 'tradition', '路数', 40),
        doctrine: optStr(payload, 'doctrine', '宗旨', 300),
        resource: optStr(payload, 'resource', '资源', 40),
        blurb: optStr(payload, 'blurb', '简介', 1200),
        relations: this.relations(payload, doc, itemId),
      }
    }
    if (kind === 'agencies') {
      return {
        id: itemId,
        name: reqStr(payload, 'name', '名称', 20),
        mandate: optStr(payload, 'mandate', '职权', 60),
        authority: optStr(payload, 'authority', '具体权限', 300),
        blurb: optStr(payload, 'blurb', '简介', 1200),
        relation: optStr(payload, 'relation', '与其他机构的关系', 400),
      }
    }
    if (kind === 'figures') {
      return {
        id: itemId,
        name: reqStr(payload, 'name', '姓名', 20),
        title: optStr(payload, 'title', '身份', 60),
        org: optStr(payload, 'org', '所属', 40),
        element: enumValue(payload, 'element', '本命五行', ELEMENTS),
        blurb: optStr(payload, 'blurb', '简介', 1200),
        hook: optStr(payload, 'hook', '钩子', 300),
      }
    }
    if (kind === 'industries') {
      return {
        id: itemId,
        name: reqStr(payload, 'name', '名称', 20),
        scale: numberValue(payload, 'scale', '规模', 1, 5, 3, true),
        risk: numberValue(payload, 'risk', '风险', 1, 5, 3, true),
        blurb: optStr(payload, 'blurb', '说明', 600),
      }
    }
    if (kind === 'cities') {
      const tiers = new Set<string>((doc.tiers ?? []).map((tier: ArchiveItem) => tier.key))
      const nations = new Set<string>((doc.nations ?? []).map((nation: ArchiveItem) => nation.id))
      const industries = new Set<string>((doc.industries ?? []).map((industry: ArchiveItem) => industry.id))
      return {
        id: itemId,
        name: reqStr(payload, 'name', '城市名', 12),
        tier: enumValue(payload, 'tier', '城市等级', [...tiers] as string[]),
        nation: enumValue(payload, 'nation', '所属国家', [...nations] as string[]),
        pop: numberValue(payload, 'pop', '人口（万）', 1, 5000, 100, true),
        industries: refList(payload, 'industries', '行业', industries, true),
        landmarks: strList(payload, 'landmarks', '地标', 24, 40),
        blurb: optStr(payload, 'blurb', '简介', 1200),
        missions: [...((existing?.missions as string[]) ?? [])],
        lat: numberValue(payload, 'lat', '纬度', -90, 90, 35.0),
        lon: numberValue(payload, 'lon', '经度', -180, 180, 105.0),
        factions: factions(payload),
      }
    }
    if (kind === 'lore') {
      return {
        id: itemId,
        title: reqStr(payload, 'title', '标题', 40),
        body: optStr(payload, 'body', '正文', 4000),
      }
    }
    if (kind === 'events') {
      const missions = new Set<string>((this.store.load<Doc>('missions').missions ?? []).map((m: ArchiveItem) => m.id))
      const traits = new Set<string>(Object.keys(this.store.load<Doc>('traits').traits ?? {}))
      const industries = new Set<string>((this.store.load<Doc>('world').industries ?? []).map((i: ArchiveItem) => i.id))
      const scope = enumValue(payload, 'scope', '适用范围', SCOPES)
      return {
        id: itemId,
        name: reqStr(payload, 'name', '事件名', 30),
        grade: numberValue(payload, 'grade', '等级', 1, 4, 3, true),
        scope,
        missions: scope === 'mission' ? refList(payload, 'missions', '限定任务', missions) : [],
        industries: refList(payload, 'industries', '行业', industries),
        text: optStr(payload, 'text', '背景', 800),
        hook: optStr(payload, 'hook', '钩子', 400),
        traits: refList(payload, 'traits', '赋予特性', traits),
        weight: numberValue(payload, 'weight', '权重', 1, 100, 10, true),
      }
    }
    if (kind === 'missions') {
      const cities = new Set<string>((this.store.load<Doc>('world').cities ?? []).map((c: ArchiveItem) => c.id))
      const missionKind = optStr(payload, 'kind', '任务类型', 20) || 'fixed'
      if (!MISSION_KINDS.includes(missionKind)) throw new EditError(`「任务类型」只能是：${MISSION_KINDS.join('、')}`)
      return {
        id: itemId,
        name: reqStr(payload, 'name', '任务名', 30),
        tier: numberValue(payload, 'tier', '等级', 1, 4, 2, true),
        kind: missionKind,
        cities: refList(payload, 'cities', '发案城市', cities, true),
        scenario_id: optStr(payload, 'scenario_id', '剧本', 32),
        blurb: optStr(payload, 'blurb', '简介', 800),
      }
    }
    if (kind === 'equipment') {
      return {
        id: itemId,
        name: reqStr(payload, 'name', '装备名', 20),
        kind: optStr(payload, 'kind', '类型', 20) || '法器',
        grade: numberValue(payload, 'grade', '品级', 1, 4, 3, true),
        price: numberValue(payload, 'price', '功德价', 0, 99999, 0, true),
        effect: optStr(payload, 'effect', '效果', 300),
        desc: optStr(payload, 'desc', '描述', 800),
      }
    }
    if (kind === 'traits') {
      return {
        name: itemId,
        spec: {
          tier: numberValue(payload, 'tier', '品级', 1, 4, 3, true),
          desc: optStr(payload, 'desc', '描述', 300),
          effect: effects(payload),
        },
      }
    }
    throw new EditError(`没有这一类档案：${kind}`)
  }

  private relations(payload: ArchiveItem, doc: Doc, selfId: string): Record<string, string> {
    const raw = payload.relations ?? {}
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      throw new EditError('「关系」要是「对象 id → 关系词」的形式')
    }
    const targets = new Set<string>([
      ...(doc.sects ?? []).map((item: ArchiveItem) => item.id),
      ...(doc.nations ?? []).map((item: ArchiveItem) => item.id),
      ...(doc.agencies ?? []).map((item: ArchiveItem) => item.id),
    ])
    const out: Record<string, string> = {}
    for (const [rawKey, rawValue] of Object.entries(raw)) {
      const key = String(rawKey).trim()
      if (!key) continue
      if (key === selfId) throw new EditError('关系里不能写自己')
      if (!targets.has(key)) throw new EditError(`关系对象不存在：${key}`)
      const text = String(rawValue ?? '').trim()
      if (text) out[key] = text
    }
    return out
  }

  // ---------------------------------------------------------------- 交叉校验

  private validate(kind: string, item: ArchiveItem, _doc: Doc): void {
    if (kind === 'sects') {
      for (const target of Object.keys(item.relations ?? {})) {
        if (target === item.id) throw new EditError('关系里不能写自己')
      }
    }
    if (kind === 'events') {
      if (item.grade <= 2 && item.scope !== 'mission') {
        throw new EditError('甲、乙级事件必须挂在限定任务上（适用范围选「限定任务」）')
      }
      if (item.scope === 'mission' && !item.missions.length) {
        throw new EditError('限定任务事件至少要挂一个任务')
      }
    }
    if (kind === 'missions' && !item.cities.length) {
      throw new EditError('任务至少要有一个发案城市')
    }
  }

  /** 删之前看看谁还在用它；返回人类可读的理由。 */
  private refs(kind: string, item: ArchiveItem, doc: Doc): string[] {
    const itemId = this.idOf(kind, item)
    const refs: string[] = []
    if (kind === 'cities') {
      const hits = (this.store.load<Doc>('missions').missions ?? [])
        .filter((mission: ArchiveItem) => (mission.cities ?? []).includes(itemId))
        .map((mission: ArchiveItem) => mission.name)
      if (hits.length) refs.push(`${hits.length} 个任务把它列为发案城市：${hits.slice(0, 3).join('、')}`)
    }
    if (kind === 'nations') {
      const hits = (doc.cities ?? []).filter((city: ArchiveItem) => city.nation === itemId).map((city: ArchiveItem) => city.name)
      if (hits.length) refs.push(`${hits.length} 座城市属于它：${hits.slice(0, 3).join('、')}`)
    }
    if (kind === 'industries') {
      const cities = (doc.cities ?? []).filter((city: ArchiveItem) => (city.industries ?? []).includes(itemId)).map((city: ArchiveItem) => city.name)
      const events = (this.store.load<Doc>('events').events ?? []).filter((event: ArchiveItem) => (event.industries ?? []).includes(itemId)).map((event: ArchiveItem) => event.name)
      if (cities.length) refs.push(`${cities.length} 座城市有这个行业：${cities.slice(0, 3).join('、')}`)
      if (events.length) refs.push(`${events.length} 条事件用这个行业：${events.slice(0, 3).join('、')}`)
    }
    if (kind === 'traits') {
      const hits = (this.store.load<Doc>('events').events ?? []).filter((event: ArchiveItem) => (event.traits ?? []).includes(itemId)).map((event: ArchiveItem) => event.name)
      if (hits.length) refs.push(`${hits.length} 条事件会赋予它：${hits.slice(0, 3).join('、')}`)
    }
    if (kind === 'missions') {
      const hits = (this.store.load<Doc>('events').events ?? []).filter((event: ArchiveItem) => (event.missions ?? []).includes(itemId)).map((event: ArchiveItem) => event.name)
      if (hits.length) refs.push(`${hits.length} 条事件挂在它下面：${hits.slice(0, 3).join('、')}`)
    }
    return refs
  }

  // ---------------------------------------------------------------- 任务的占位剧本

  /** 任务必须有剧本才能开局：没填就顺手生成一个能跑的占位剧本。 */
  private prepareScenario(item: ArchiveItem, doc: Doc): [ArchiveItem, Doc | null] {
    if (item.scenario_id) {
      const exists = new Set((this.store.load<Doc>('scenarios').scenarios ?? []).map((s: ArchiveItem) => s.id))
      if (!exists.has(item.scenario_id)) throw new EditError(`剧本不存在：${item.scenario_id}`)
      return [item, null]
    }
    const scenarioDoc = clone(this.store.load<Doc>('scenarios'))
    const scenarioId = item.id
    if (!(scenarioDoc.scenarios ?? []).some((s: ArchiveItem) => s.id === scenarioId)) {
      scenarioDoc.scenarios.push(this.stubScenario(item, doc))
    }
    item.scenario_id = scenarioId
    return [item, scenarioDoc]
  }

  /** 给新任务生成一个最小可玩剧本：勘查 → 抉择 → 结案。 */
  private stubScenario(item: ArchiveItem, doc: Doc): ArchiveItem {
    const name = item.name
    const city = (doc.cities ?? []).find((c: ArchiveItem) => (item.cities ?? []).includes(c.id))?.name ?? '现场'
    return {
      id: item.id,
      code: String(item.id).toUpperCase().slice(0, 8),
      name,
      brief: '创建任务时自动生成的占位剧本，可直接开局；想写得细就改 content/scenarios.json。',
      place: city,
      start_corruption: 8,
      scenes: [
        {
          id: 's1', kind: 'investigate', name: `现场勘查：${name}`, place: city,
          text: item.blurb || '案子刚接进来，现场还封着。',
          options: [
            {
              id: 'a', label: '先看现场留下了什么', skill: 'investigate',
              success: '你在现场找到了一处不对劲的地方。',
              fail: '现场被人动过，线索断了。',
              clue: `${name}：现场有异`,
            },
            {
              id: 'b', label: '找附近的人问一问', skill: 'persuade',
              success: '有人愿意开口，但只说了半句。',
              fail: '没人愿意说。',
              clue: `${name}：有人知情`,
            },
          ],
        },
        {
          id: 's2', kind: 'choice', name: '抉择：这桩案子怎么收', place: city,
          text: '线索够了。接下来怎么做，决定这桩因果怎么算。',
          choices: [
            {
              id: 'purify', label: '按规矩了结，该超度的超度',
              text: '你把该办的仪式办完，把该说的话说完。',
              merit: 6, corruption: -4, karma: '善',
            },
            {
              id: 'burn', label: '断根，省得夜长梦多',
              text: '你处理得很干净，干净到没人再提起。',
              merit: -3, corruption: 3, karma: '阴债',
            },
          ],
        },
        { id: 's3', kind: 'ending', name: '结案', place: '归卷', text: '案子结了。' },
      ],
      endings: {
        good: '案子了了。这座城市照常运转，只是少了一桩旧账。',
        neutral: '案子结了，档案归档。你在报告里写「已处置」。',
        bad: '案子结了，但根没断。它会在别的地方换个名字再长出来。',
      },
      auto: true,
    }
  }

  /** 删任务时把它自动生成的占位剧本一起删掉；手写的剧本不动。 */
  private dropStubScenario(missionId: string): Doc | null {
    const scenarios = this.store.load<Doc>('scenarios').scenarios ?? []
    const stub = scenarios.find((s: ArchiveItem) => s.id === missionId && s.auto)
    if (!stub) return null
    const doc = clone(this.store.load<Doc>('scenarios'))
    doc.scenarios = (doc.scenarios ?? []).filter((s: ArchiveItem) => s.id !== missionId)
    return doc
  }
}

// ---------------------------------------------------------------- 字段读取

function cleanId(raw: unknown): string {
  if (typeof raw !== 'string' || !ID_RE.test(raw.trim())) {
    throw new EditError('id 只能用小写字母、数字、下划线，字母开头，2–32 位')
  }
  return raw.trim()
}

function reqStr(payload: ArchiveItem, key: string, label: string, maxlen = 400): string {
  const value = payload[key]
  if (typeof value !== 'string') throw new EditError(`「${label}」要填文本`)
  const text = value.trim()
  if (!text) throw new EditError(`「${label}」不能为空`)
  if (text.length > maxlen) throw new EditError(`「${label}」太长（最多 ${maxlen} 字）`)
  return text
}

function optStr(payload: ArchiveItem, key: string, label: string, maxlen = 400): string {
  const value = payload[key]
  if (value === null || value === undefined) return ''
  if (typeof value !== 'string') throw new EditError(`「${label}」要填文本`)
  const text = value.trim()
  if (text.length > maxlen) throw new EditError(`「${label}」太长（最多 ${maxlen} 字）`)
  return text
}

function numberValue(
  payload: ArchiveItem,
  key: string,
  label: string,
  low: number,
  high: number,
  fallback?: number,
  integer = false,
): number {
  let raw = payload[key]
  if (raw === null || raw === undefined || raw === '') {
    if (fallback === undefined) throw new EditError(`「${label}」不能为空`)
    raw = fallback
  }
  const number = integer ? Math.trunc(Number(raw)) : Number(raw)
  if (!Number.isFinite(number)) throw new EditError(`「${label}」要填数字`)
  if (number < low || number > high) throw new EditError(`「${label}」要在 ${low} 到 ${high} 之间`)
  return number
}

function enumValue(payload: ArchiveItem, key: string, label: string, allowed: string[]): string {
  const value = reqStr(payload, key, label, 40)
  if (!allowed.includes(value)) throw new EditError(`「${label}」只能是：${allowed.join('、')}`)
  return value
}

function strList(
  payload: ArchiveItem,
  key: string,
  label: string,
  maxItems = 24,
  maxlen = 80,
  required = false,
): string[] {
  const raw = payload[key] ?? []
  if (!Array.isArray(raw)) throw new EditError(`「${label}」要填列表`)
  const out: string[] = []
  for (const value of raw) {
    if (typeof value !== 'string') throw new EditError(`「${label}」里的每一项都要是文本`)
    const text = value.trim()
    if (!text) continue
    if (text.length > maxlen) throw new EditError(`「${label}」里有一项太长（最多 ${maxlen} 字）`)
    if (!out.includes(text)) out.push(text)
  }
  if (required && !out.length) throw new EditError(`「${label}」至少填一项`)
  if (out.length > maxItems) throw new EditError(`「${label}」最多 ${maxItems} 项`)
  return out
}

function refList(
  payload: ArchiveItem,
  key: string,
  label: string,
  valid: Set<string>,
  required = false,
  maxItems = 24,
): string[] {
  const out = strList(payload, key, label, maxItems, 80, required)
  const bad = out.filter((value) => !valid.has(value))
  if (bad.length) throw new EditError(`「${label}」里有不存在的项：${bad.join('、')}`)
  return out
}

function effects(payload: ArchiveItem): Record<string, number> {
  const raw = payload.effect ?? {}
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new EditError('「效果」要是「属性 → 数值」的形式')
  const out: Record<string, number> = {}
  for (const [rawKey, rawValue] of Object.entries(raw)) {
    const key = String(rawKey).trim()
    if (!key) continue
    const number = Math.trunc(Number(rawValue))
    if (!Number.isFinite(number)) throw new EditError(`效果「${key}」要填整数`)
    if (number) out[key] = number
  }
  return out
}

function factions(payload: ArchiveItem): ArchiveItem[] {
  const raw = payload.factions ?? []
  if (!Array.isArray(raw)) throw new EditError('「当地势力」要是列表')
  return raw.map((row: any) => {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      throw new EditError('「当地势力」里每一条都要是对象')
    }
    return {
      name: reqStr(row, 'name', '势力名称', 40),
      kind: optStr(row, 'kind', '势力类型', 20) || '其他',
      note: optStr(row, 'note', '势力说明', 120),
    }
  })
}
