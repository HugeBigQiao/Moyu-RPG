/**
 * 数据库骨架测试：建表、PRAGMA、事务、关闭钩子。
 *
 * 只验证骨架，不验证业务查询；业务查询在 P6 与接口一起测。
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from 'cordis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Db, sqliteUrl } from '../src/db/client.ts'

let ctx: Context
let db: Db
let tempDir: string
let file: string

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'moyu-db-'))
  file = join(tempDir, 'test.db')
  ctx = new Context()
  await ctx.use(Db, { url: sqliteUrl(file) })
  db = ctx.get('db') as Db
  await db.ready
})

afterAll(async () => {
  await ctx.fiber.dispose()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('数据库骨架', () => {
  it('建出三张表', async () => {
    const rows = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
    const names = rows.map((row) => row.name)
    expect(names).toEqual(expect.arrayContaining(['characters', 'sessions', 'session_logs']))
  })

  it('打开外键与 WAL', async () => {
    expect(await db.get('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 })
    expect(await db.get('PRAGMA journal_mode')).toEqual({ journal_mode: 'wal' })
  })

  it('可以写入并读回一张角色卡', async () => {
    const now = '2026-11-17 00:00:00.000000'
    const id = await db.insert('characters', {
      code: 'test-001', name: '测试角色', school: 'fulu', element: '木',
      rarity: '凡', rank: '初真', merit: 20, attrs: '{}', traits: '[]',
      approval: '{}', notes: '', seed: 'seed', kind: 'npc', city: 'nanyu',
      events: '[]', mission: null, difficulty: 1, reward: 5,
      completed_sessions: 0, karma_good: 0, karma_debt: 0,
      mind_trial_passed: 0, trial_attempts: 0, items: '[]', ascensions: '[]',
      created_at: now,
    })
    expect(id).toBe(1)
    const row = await db.get('SELECT code, name, attrs FROM characters')
    expect(row).toEqual({ code: 'test-001', name: '测试角色', attrs: '{}' })
  })

  it('事务回滚', async () => {
    await expect(db.transaction(async (tx) => {
      await tx.insert('characters', {
        code: 'tx-1', name: '回滚', school: 'fulu', element: '木',
        rarity: '凡', rank: '初真', merit: 1, attrs: '{}', traits: '[]',
        approval: '{}', notes: '', seed: 's', kind: 'npc', city: 'nanyu',
        events: '[]', mission: null, difficulty: 1, reward: 1,
        completed_sessions: 0, karma_good: 0, karma_debt: 0,
        mind_trial_passed: 0, trial_attempts: 0, items: '[]', ascensions: '[]',
        created_at: '2026-11-17 00:00:00.000000',
      })
      throw new Error('rollback')
    })).rejects.toThrow('rollback')

    const count = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM characters WHERE code = 'tx-1'")
    expect(count?.n).toBe(0)
  })

  it('重复迁移不报错', async () => {
    await expect(db.ready).resolves.toBeUndefined()
    expect(existsSync(file)).toBe(true)
  })
})
