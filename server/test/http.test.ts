/**
 * HTTP 骨架测试：健康检查、静态产物缓存头、SPA 兜底、404 与内容重载。
 *
 * 用 port=0 让系统分配端口，避免和本地 8888 冲突；每个测试进程用独立临时目录。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AppHandle } from '../src/app.ts'
import { createApp } from '../src/app.ts'
import { CONTENT_DIR } from './helpers.ts'
import { sqliteUrl } from '../src/db/client.ts'
import type { HttpServer } from '../src/plugins/http.ts'

let handle: AppHandle
let server: HttpServer
let baseUrl: string
let tempDir: string

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'moyu-http-'))
  mkdirSync(join(tempDir, 'dist/assets'), { recursive: true })
  writeFileSync(join(tempDir, 'dist/index.html'), '<html><body>ok</body></html>')
  writeFileSync(join(tempDir, 'dist/assets/app.js'), 'console.log(1)')

  handle = await createApp({
    host: '127.0.0.1',
    port: 0,
    contentDir: CONTENT_DIR,
    databaseUrl: sqliteUrl(join(tempDir, 'test.db')),
    frontendDist: join(tempDir, 'dist'),
  })
  server = handle.app.get('server') as HttpServer
  baseUrl = `http://127.0.0.1:${server.port}`
})

afterAll(async () => {
  await handle.close()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('HTTP 骨架', () => {
  it('健康检查列出服务', async () => {
    const response = await fetch(`${baseUrl}/api/health`)
    expect(response.status).toBe(200)
    const data = await response.json() as any
    expect(data.ok).toBe(true)
    expect(data.services).toEqual({ content: true, db: true, rules: true })
    expect(data.port).toBe(server.port)
  })

  it('index.html 发 no-store，/assets/* 发 immutable', async () => {
    const index = await fetch(`${baseUrl}/`)
    expect(index.status).toBe(200)
    expect(await index.text()).toContain('ok')
    expect(index.headers.get('cache-control')).toContain('no-store')

    const asset = await fetch(`${baseUrl}/assets/app.js`)
    expect(asset.status).toBe(200)
    expect(asset.headers.get('cache-control')).toContain('immutable')
    expect(await asset.text()).toBe('console.log(1)')
  })

  it('未知前端路由回落到 index.html', async () => {
    const response = await fetch(`${baseUrl}/archive/nope`)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('ok')
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('未知接口是 JSON 404', async () => {
    const response = await fetch(`${baseUrl}/api/nope`)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ detail: '接口不存在' })
  })

  it('内容重载返回每个文件的状态', async () => {
    const response = await fetch(`${baseUrl}/api/admin/reload`, { method: 'POST' })
    expect(response.status).toBe(200)
    const data = await response.json() as any
    expect(data.report.world).toBe('ok')
    expect(data.report.shop).toBe('ok')
  })
})
