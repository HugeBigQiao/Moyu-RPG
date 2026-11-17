/**
 * 接口集成测试：起真实 HTTP 服务 + 临时内容目录 + 临时 SQLite，
 * 走一遍「生成人物 → 角色卡 → 开团 → 行动 → 档案编辑」。
 *
 * 为什么不用 mock：路由/鉴权/JSON/数据库/内容写回是一条链，mock 掉任何一段都测不出问题。
 */
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp, type AppHandle } from '../src/app.ts'
import { sqliteUrl } from '../src/db/client.ts'
import type { HttpServer } from '../src/plugins/http.ts'
import { CONTENT_DIR } from './helpers.ts'

let handle: AppHandle
let baseUrl: string
let tempDir: string

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'moyu-api-'))
  cpSync(CONTENT_DIR, join(tempDir, 'content'), { recursive: true })
  mkdirSync(join(tempDir, 'dist'), { recursive: true })
  writeFileSync(join(tempDir, 'dist/index.html'), '<html>ok</html>')
  handle = await createApp({
    host: '127.0.0.1',
    port: 0,
    contentDir: join(tempDir, 'content'),
    databaseUrl: sqliteUrl(join(tempDir, 'test.db')),
    frontendDist: join(tempDir, 'dist'),
  })
  baseUrl = `http://127.0.0.1:${(handle.app.get('server') as HttpServer).port}`
})

afterAll(async () => {
  await handle.close()
  rmSync(tempDir, { recursive: true, force: true })
})

async function call(path: string, init?: RequestInit) {
  const response = await fetch(baseUrl + path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const text = await response.text()
  return { status: response.status, data: text ? JSON.parse(text) : null }
}

describe('接口集成', () => {
  it('世界与档案只读接口', async () => {
    const world = await call('/api/world')
    expect(world.status).toBe(200)
    expect(world.data.cities.length).toBe(10)
    expect((await call('/api/events')).data.events.length).toBeGreaterThan(10)
    expect((await call('/api/missions')).data.missions.length).toBeGreaterThanOrEqual(5)
    expect((await call('/api/traits')).data.traits.length).toBeGreaterThan(10)
  })

  it('生成人物并读角色卡', async () => {
    const made = await call('/api/npcs', { method: 'POST', body: JSON.stringify({ count: 1, city: 'nanyu' }) })
    expect(made.status).toBe(200)
    expect(made.data.created).toBe(1)
    const id = made.data.people[0].id

    const sheet = await call(`/api/characters/${id}`)
    expect(sheet.status).toBe(200)
    expect(sheet.data.attrs.length).toBe(6)
    expect(sheet.data.skills.length).toBe(10)
    expect(sheet.data.shelf.length).toBeGreaterThan(0)
    expect(sheet.data.progress.reqs).toBeInstanceOf(Array)
  })

  it('开团并执行一次行动', async () => {
    const made = await call('/api/npcs', { method: 'POST', body: JSON.stringify({ count: 1 }) })
    const characterId = made.data.people[0].id
    const session = await call('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ character_id: characterId, scenario_id: 'mirror' }),
    })
    expect(session.status).toBe(200)
    expect(session.data.code).toMatch(/^INC-0417-\d{3}$/)

    const detail = await call(`/api/sessions/${session.data.id}`)
    expect(detail.data.view.actions.length).toBeGreaterThan(0)
    const action = detail.data.view.actions.find((item: any) => item.enabled)
    const acted = await call(`/api/sessions/${session.data.id}/act`, {
      method: 'POST',
      body: JSON.stringify({ action: action.id }),
    })
    expect(acted.status).toBe(200)
    expect(acted.data.events.length).toBeGreaterThan(0)
    expect(acted.data.view.turn).toBe(2)
  })

  it('总览/地图/城市面板', async () => {
    const dashboard = await call('/api/dashboard')
    expect(dashboard.status).toBe(200)
    expect(dashboard.data.totals.characters).toBeGreaterThanOrEqual(2)
    expect((await call('/api/game/map')).data.cities.length).toBe(10)
    expect((await call('/api/game/city/nanyu')).data.city.id).toBe('nanyu')
  })

  it('档案编辑写回临时内容目录', async () => {
    const kinds = await call('/api/archive/kinds')
    expect(kinds.data.kinds.length).toBe(11)

    const created = await call('/api/archive/lore', {
      method: 'POST',
      body: JSON.stringify({ item: { id: 'zz_api_test', title: '接口测试', body: '正文' } }),
    })
    expect(created.status).toBe(200)
    expect(created.data.item.id).toBe('zz_api_test')

    const world = await call('/api/world')
    expect(world.data.lore.some((item: any) => item.id === 'zz_api_test')).toBe(true)

    const removed = await call('/api/archive/lore/zz_api_test', { method: 'DELETE' })
    expect(removed.status).toBe(200)
    expect((await call('/api/world')).data.lore.some((item: any) => item.id === 'zz_api_test')).toBe(false)
  })
})
