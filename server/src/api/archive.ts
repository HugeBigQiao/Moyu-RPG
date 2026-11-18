/**
 * 档案接口（只读 + 编辑）。
 *
 * 职责：
 *     对外输出世界、事件、任务、装备、特性、剧本；内容热重载；11 类档案的增删改。
 * 为什么需要：
 *     档案页只读内容，不该让前端直接读文件；编辑也要收在一处。
 * 上下游：
 *     上游：content/*、content/edit；下游：前端档案页、/api/admin/*。
 */
import type { Context } from 'cordis'
import { EditError } from '../content/edit.ts'
import { preview } from '../core/mission.ts'
import { HttpError, sendJson } from '../plugins/http.ts'
import { cityPayload } from './common.ts'

export function registerArchive(ctx: Context): void {
  const content = ctx.content
  const server = ctx.server

  server.get('/api/world', (_req, res) => {
    const world = content.data.world
    sendJson(res, 200, {
      nations: world.nations,
      sects: world.sects,
      agencies: world.agencies,
      figures: world.figures,
      industries: world.industries,
      lore: world.lore,
      tiers: world.tiers,
      cities: world.cities.map((city) => cityPayload(content.data, city)),
    })
  })

  server.get('/api/events', (_req, res) => {
    const data = content.data
    sendJson(res, 200, {
      events: data.events.events.map((event) => ({
        ...event,
        grade_name: data.events.grades[event.grade]?.name ?? '?',
        trait_names: (event.traits ?? [])
          .filter((name) => data.traits.traits[name])
          .map((name) => ({ name, ...data.traits.traits[name] })),
      })),
      grades: data.events.grades,
      trait_tiers: data.traits.tiers,
    })
  })

  server.get('/api/missions', (_req, res) => {
    const data = content.data
    sendJson(res, 200, {
      missions: data.missions.missions.map((item) => ({
        ...item,
        city_names: (item.cities ?? [])
          .filter((id) => data.world.cityById.has(id))
          .map((id) => data.world.cityById.get(id)!.name),
        scenario: item.scenario_id ?? null,
      })),
      random_types: data.world.cities.map((city) => ({
        city: city.id,
        city_name: city.name,
        tier: city.tier,
        industries: (city.industries ?? []).map((id) => data.world.industryById.get(id)?.name ?? id),
      })),
    })
  })

  server.get('/api/missions/random', (req, res) => {
    const city = req.query.get('city') ?? 'nanyu'
    const count = Number(req.query.get('count') ?? 3)
    if (!content.data.world.cityById.has(city)) throw new HttpError(404, '没有这个城市')
    sendJson(res, 200, { city, samples: preview(content.data, city, Number.isFinite(count) ? count : 3) })
  })

  server.get('/api/equipment', (_req, res) => {
    const data = content.data
    sendJson(res, 200, {
      equipment: data.equipment.equipment.map((item) => ({
        ...item,
        grade_name: { 1: '甲', 2: '乙', 3: '丙', 4: '丁' }[item.grade] ?? '?',
      })),
      kinds: ['法器', '阴器', '耗材', '护具'],
    })
  })

  server.get('/api/traits', (_req, res) => {
    const data = content.data
    sendJson(res, 200, {
      traits: Object.entries(data.traits.traits).map(([name, spec]) => ({
        name,
        ...spec,
        tier_name: (data.traits.tiers[spec.tier] as any)?.name ?? '?',
      })),
      tiers: data.traits.tiers,
    })
  })

  server.get('/api/scenarios', (_req, res) => {
    const data = content.data
    sendJson(res, 200, {
      scenarios: data.scenarios.scenarios,
      bestiary: data.bestiary.bestiary,
      talismans: data.talismans.talismans,
      spirits: data.spirits.spirits,
      shop: data.shop.items,
    })
  })

  server.get('/api/admin/content', (_req, res) => {
    sendJson(res, 200, content.status())
  })

  server.post('/api/admin/reload', (_req, res) => {
    sendJson(res, 200, { report: content.reload(), status: content.status() })
  })
}

export function registerArchiveEdit(ctx: Context): void {
  const content = ctx.content
  const db = ctx.db
  const server = ctx.server
  const editor = content.editor()

  server.get('/api/archive/kinds', (_req, res) => {
    sendJson(res, 200, { kinds: editor.kinds() })
  })

  const payloadOf = (body: any) =>
    body && typeof body.item === 'object' && body.item !== null ? body.item : body

  const handle = (callback: () => any) => {
    try {
      return callback()
    } catch (error) {
      if (error instanceof EditError) throw new HttpError(400, error.message)
      throw error
    }
  }

  server.post('/api/archive/:kind', async (req, res) => {
    const body = await req.json()
    const kind = req.params.kind
    const item = handle(() => editor.create(kind, payloadOf(body)))
    sendJson(res, 200, { ok: true, kind, item, count: editor.count(kind) })
  })

  server.put('/api/archive/:kind/:id', async (req, res) => {
    const body = await req.json()
    const kind = req.params.kind
    const item = handle(() => editor.update(kind, req.params.id, payloadOf(body)))
    sendJson(res, 200, { ok: true, kind, item })
  })

  server.delete('/api/archive/:kind/:id', async (req, res) => {
    const kind = req.params.kind
    const itemId = req.params.id
    const extra = await characterRefs(db, kind, itemId)
    const item = handle(() => editor.remove(kind, itemId, extra))
    sendJson(res, 200, { ok: true, kind, item, count: editor.count(kind) })
  })
}

async function characterRefs(db: any, kind: string, itemId: string): Promise<string[]> {
  if (kind === 'cities') {
    const row = await db.get('SELECT COUNT(*) AS n FROM characters WHERE city = ?', [itemId])
    const total = Number(row?.n ?? 0)
    return total ? [`还有 ${total} 个人物登记在这座城市`] : []
  }
  if (kind === 'traits') {
    const rows = await db.all('SELECT name, traits FROM characters')
    const hits: string[] = []
    for (const row of rows) {
      let traits: any[]
      try {
        traits = typeof row.traits === 'string' ? JSON.parse(row.traits) : (row.traits ?? [])
      } catch {
        // 历史坏数据不值得让整个删除请求 500；跳过这一行
        continue
      }
      if (traits.some((trait: any) => traitName(trait) === itemId)) hits.push(row.name)
    }
    return hits.length ? [`还有 ${hits.length} 个人物带着这个特性（${hits.slice(0, 3).join('、')}）`] : []
  }
  return []
}

function traitName(row: any): string {
  return row && typeof row === 'object' ? row.name ?? '' : String(row)
}
