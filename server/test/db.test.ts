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
import { Db } from '../src/db/client.ts'

let ctx: Context
let db: Db
let tempDir: string
let file: string

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'moyu-db-'))
  file = join(tempDir, 'test.db')
  ctx = new Context()
  await ctx.use(Db, { file })
  db = ctx.get('db') as Db
})

afterAll(async () => {
  await ctx.fiber.dispose()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('数据库骨架', () => {
  it('建出三张表', () => {
    const rows = db.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>
    const names = rows.map((row) => row.name)
    expect(names).toEqual(expect.arrayContaining(['characters', 'sessions', 'session_logs']))
  })

  it('打开外键与 WAL', () => {
    expect(db.db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 })
    expect(db.db.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' })
  })

  it('可以写入并读回一张角色卡', () => {
    const now = '2026-11-17 00:00:00.000000'
    db.db.prepare(`
      INSERT INTO characters (
        code, name, school, element, rarity, rank, merit, attrs, traits, approval,
        notes, seed, kind, city, events, mission, difficulty, reward,
        completed_sessions, karma_good, karma_debt, mind_trial_passed, trial_attempts,
        items, ascensions, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?
      )
    `).run(
      'test-001', '测试角色', 'fulu', '木', '凡', '初真', 20, '{}', '[]', '{}',
      '', 'seed', 'npc', 'nanyu', '[]', null, 1, 5,
      0, 0, 0, 0, 0,
      '[]', '[]', now,
    )
    const row = db.db.prepare('SELECT code, name, attrs FROM characters').get() as {
      code: string
      name: string
      attrs: string
    }
    expect(row).toEqual({ code: 'test-001', name: '测试角色', attrs: '{}' })
  })

  it('事务回滚', () => {
    expect(() => db.transaction(() => {
      db.db.prepare("INSERT INTO characters (code, name, school, element, rarity, rank, merit, attrs, traits, approval, notes, seed, kind, city, events, mission, difficulty, reward, completed_sessions, karma_good, karma_debt, mind_trial_passed, trial_attempts, items, ascensions, created_at) VALUES ('tx-1','回滚','fulu','木','凡','初真',1,'{}','[]','{}','','s','npc','nanyu','[]',null,1,1,0,0,0,0,0,'[]','[]','2026-11-17 00:00:00.000000')").run()
      throw new Error('rollback')
    })).toThrow('rollback')
    const count = db.db.prepare("SELECT COUNT(*) AS n FROM characters WHERE code = 'tx-1'").get() as { n: number }
    expect(count.n).toBe(0)
  })

  it('重复迁移不报错', () => {
    expect(() => db.migrate()).not.toThrow()
    expect(existsSync(file)).toBe(true)
  })
})
