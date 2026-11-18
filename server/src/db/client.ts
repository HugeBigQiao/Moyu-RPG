/**
 * 数据库服务。
 *
 * 职责：
 *     按 URL 选择 SQLite / PostgreSQL / MySQL 驱动，提供统一的 all/get/run/insert/transaction；
 *     SQLite 用 Node 内置 node:sqlite（零原生依赖），PG/MySQL 用可选驱动。
 * 为什么需要：
 *     本地单人默认 SQLite；部署到 PG/MySQL 时只换 MOYU_DATABASE_URL，业务 SQL 不写方言分支。
 * 上下游：
 *     上游：config.databaseUrl；下游：plugins/api-*、plugins/game。
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Service, type Context } from 'cordis'
import Schema from 'schemastery'
import { SERVER_ROOT } from '../config.ts'

declare module 'cordis' {
  interface Context {
    db: Db
  }
}

export type Dialect = 'sqlite' | 'postgresql' | 'mysql'

export interface DbConfig {
  url: string
}

/** loader 用的插件配置：数据库地址；默认落在 server/data/moyu.db。 */
export const Config = Schema.object({
  url: Schema.string().default('sqlite://./data/moyu.db').description('数据库地址（sqlite:// / postgresql:// / mysql://）'),
})

export interface RunResult {
  rows: any[]
  changes: number
  lastInsertRowid?: number
}

export interface SqlExecutor {
  all<T = any>(sql: string, params?: any[]): Promise<T[]>
  get<T = any>(sql: string, params?: any[]): Promise<T | undefined>
  run(sql: string, params?: any[]): Promise<RunResult>
  insert(table: string, data: Record<string, any>): Promise<number>
}

interface ParsedUrl {
  dialect: Dialect
  file?: string
  connectionString?: string
}

export function parseDatabaseUrl(url: string): ParsedUrl {
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    return { dialect: 'postgresql', connectionString: url }
  }
  if (url.startsWith('mysql://')) {
    return { dialect: 'mysql', connectionString: url }
  }
  let rest = url
  if (rest.startsWith('sqlite:')) rest = rest.slice('sqlite:'.length)
  if (rest.startsWith('//')) rest = rest.slice(2)
  if (!rest) throw new Error(`看不懂的数据库地址：${url}`)
  return { dialect: 'sqlite', file: rest }
}

export function sqliteUrl(file: string): string {
  return 'sqlite://' + file
}

/** Python datetime.now(timezone.utc) 在 SQLite 里的存储格式。 */
export function quoteIdent(dialect: Dialect, name: string): string {
  if (dialect === 'mysql') return `\`${name}\``
  return `"${name}"`
}

export function nowStamp(now = new Date()): string {
  const iso = now.toISOString()
  return iso.slice(0, 19).replace('T', ' ') + '.000000'
}

/** 接口展示用的 "%m-%d %H:%M"。 */
export function stamp(value: string | null | undefined): string {
  if (!value) return ''
  return String(value).slice(5, 16)
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T } catch { return fallback }
  }
  return value as T
}

export function jsonValue(value: unknown): string {
  return JSON.stringify(value ?? null)
}

function normalizeParams(params: any[]): any[] {
  return params.map((value) => (typeof value === 'boolean' ? (value ? 1 : 0) : value === undefined ? null : value))
}

function toPgSql(sql: string): string {
  let index = 0
  return sql.replace(/\?/g, () => `$${++index}`)
}

export class Db extends Service implements SqlExecutor {
  static Config = Config
  readonly url: string
  readonly dialect: Dialect
  readonly ready: Promise<void>
  private sqlite?: DatabaseSync
  private pgPool?: any
  private mysqlPool?: any
  /** SQLite 是单连接：事务必须排队，否则并发请求会撞 "cannot start a transaction within a transaction" */
  private txLock: Promise<unknown> = Promise.resolve()

  constructor(ctx: Context, config: DbConfig) {
    super(ctx, 'db')
    this.url = config.url
    const parsed = parseDatabaseUrl(config.url)
    this.dialect = parsed.dialect
    this.ready = this.init(parsed)
    // 启动期没有请求会 await ready；不接住的话初始化失败会变成未处理拒绝直接杀进程
    void this.ready.catch(() => {})
    ctx.effect(() => () => this.close(), 'db.close')
  }

  private async init(parsed: ParsedUrl): Promise<void> {
    if (parsed.dialect === 'sqlite') {
      const file = resolve(SERVER_ROOT, parsed.file!)
      mkdirSync(dirname(file), { recursive: true })
      this.sqlite = new DatabaseSync(file)
      this.sqlite.exec('PRAGMA foreign_keys = ON')
      this.sqlite.exec('PRAGMA journal_mode = WAL')
      await this.migrate()
      return
    }
    if (parsed.dialect === 'postgresql') {
      const pg = await import('pg')
      const Pool = (pg as any).Pool ?? (pg as any).default?.Pool
      this.pgPool = new Pool({ connectionString: parsed.connectionString })
    } else {
      const mysql = await import('mysql2/promise')
      const mod = (mysql as any).default ?? mysql
      this.mysqlPool = mod.createPool({ uri: parsed.connectionString, multipleStatements: true })
    }
    await this.migrate()
  }

  private async migrate(): Promise<void> {
    const schemaFile = this.dialect === 'sqlite'
      ? 'schema.sql'
      : this.dialect === 'postgresql' ? 'schema.postgres.sql' : 'schema.mysql.sql'
    const schema = readFileSync(resolve(import.meta.dirname, schemaFile), 'utf8')
    if (this.dialect === 'sqlite') {
      this.sqlite!.exec(schema)
    } else if (this.dialect === 'postgresql') {
      await this.pgPool.query(schema)
    } else {
      await this.mysqlPool.query(schema)
    }
    await this.ensureRulesVersion()
  }

  /** 老库可能没有 rules_version；补一列，失败（已存在）就忽略。 */
  private async ensureRulesVersion(): Promise<void> {
    try {
      if (this.dialect === 'sqlite') {
        const rows = this.sqlite!.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>
        if (!rows.some((row) => row.name === 'rules_version')) {
          this.sqlite!.exec('ALTER TABLE sessions ADD COLUMN rules_version INTEGER NOT NULL DEFAULT 1')
        }
      } else if (this.dialect === 'postgresql') {
        const result = await this.pgPool.query(
          "SELECT column_name FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'rules_version'",
        )
        if (!result.rows.length) {
          await this.pgPool.query('ALTER TABLE sessions ADD COLUMN rules_version INTEGER NOT NULL DEFAULT 1')
        }
      } else {
        const [rows] = await this.mysqlPool.query("SHOW COLUMNS FROM sessions LIKE 'rules_version'")
        if (!(rows as any[]).length) {
          await this.mysqlPool.query('ALTER TABLE sessions ADD COLUMN rules_version INTEGER NOT NULL DEFAULT 1')
        }
      }
    } catch {
      // 并发启动时另一进程可能已经加过；这里不阻塞启动
    }
  }

  async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    await this.ready
    const values = normalizeParams(params)
    if (this.sqlite) return this.sqlite.prepare(sql).all(...values) as T[]
    if (this.pgPool) {
      const result = await this.pgPool.query(toPgSql(sql), values)
      return result.rows as T[]
    }
    const [rows] = await this.mysqlPool.query(sql, values)
    return rows as T[]
  }

  async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    const rows = await this.all<T>(sql, params)
    return rows[0]
  }

  async run(sql: string, params: any[] = []): Promise<RunResult> {
    await this.ready
    const values = normalizeParams(params)
    if (this.sqlite) {
      const result = this.sqlite.prepare(sql).run(...values)
      return {
        rows: [],
        changes: Number(result.changes),
        lastInsertRowid: Number(result.lastInsertRowid),
      }
    }
    if (this.pgPool) {
      const result = await this.pgPool.query(toPgSql(sql), values)
      return { rows: result.rows, changes: result.rowCount ?? 0 }
    }
    const [result] = await this.mysqlPool.query(sql, values)
    return {
      rows: [],
      changes: Number((result as any).affectedRows ?? 0),
      lastInsertRowid: Number((result as any).insertId ?? 0),
    }
  }

  async insert(table: string, data: Record<string, any>): Promise<number> {
    await this.ready
    const columns = Object.keys(data)
    const quoted = columns.map((column) => quoteIdent(this.dialect, column))
    const placeholders = columns.map(() => '?').join(', ')
    const sql = `INSERT INTO ${table} (${quoted.join(', ')}) VALUES (${placeholders})`
    const values = normalizeParams(Object.values(data))

    if (this.sqlite) {
      const result = this.sqlite.prepare(sql).run(...values)
      return Number(result.lastInsertRowid)
    }
    if (this.pgPool) {
      const result = await this.pgPool.query(toPgSql(sql) + ' RETURNING id', values)
      return Number(result.rows[0].id)
    }
    const [result] = await this.mysqlPool.query(sql, values)
    return Number((result as any).insertId)
  }

  async transaction<T>(callback: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    await this.ready
    if (this.sqlite) {
      const run = this.txLock.then(async () => {
        this.sqlite!.exec('BEGIN')
        try {
          const result = await callback(this)
          this.sqlite!.exec('COMMIT')
          return result
        } catch (error) {
          try { this.sqlite!.exec('ROLLBACK') } catch { /* 已回滚 */ }
          throw error
        }
      })
      // 事务失败不能把后续事务一起带崩
      this.txLock = run.then(() => undefined, () => undefined)
      return run
    }
    if (this.pgPool) {
      const client = await this.pgPool.connect()
      try {
        await client.query('BEGIN')
        const result = await callback(makePgExecutor(client))
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    }
    const connection = await this.mysqlPool.getConnection()
    try {
      await connection.beginTransaction()
      const result = await callback(makeMysqlExecutor(connection))
      await connection.commit()
      return result
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  async close(): Promise<void> {
    try {
      this.sqlite?.close()
    } catch { /* 已关闭 */ }
    try {
      await this.pgPool?.end()
    } catch { /* 忽略关闭异常 */ }
    try {
      await this.mysqlPool?.end()
    } catch { /* 忽略关闭异常 */ }
  }
}

function makePgExecutor(client: any): SqlExecutor {
  return {
    async all(sql, params = []) {
      const result = await client.query(toPgSql(sql), normalizeParams(params))
      return result.rows
    },
    async get(sql, params = []) {
      const result = await client.query(toPgSql(sql), normalizeParams(params))
      return result.rows[0]
    },
    async run(sql, params = []) {
      const result = await client.query(toPgSql(sql), normalizeParams(params))
      return { rows: result.rows, changes: result.rowCount ?? 0 }
    },
    async insert(table, data) {
      const columns = Object.keys(data)
      const quoted = columns.map((column) => quoteIdent('postgresql', column))
      const sql = `INSERT INTO ${table} (${quoted.join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) RETURNING id`
      const result = await client.query(toPgSql(sql), normalizeParams(Object.values(data)))
      return Number(result.rows[0].id)
    },
  }
}

function makeMysqlExecutor(connection: any): SqlExecutor {
  return {
    async all(sql, params = []) {
      const [rows] = await connection.query(sql, normalizeParams(params))
      return rows
    },
    async get(sql, params = []) {
      const [rows] = await connection.query(sql, normalizeParams(params))
      return rows[0]
    },
    async run(sql, params = []) {
      const [result] = await connection.query(sql, normalizeParams(params))
      return {
        rows: [],
        changes: Number(result.affectedRows ?? 0),
        lastInsertRowid: Number(result.insertId ?? 0),
      }
    },
    async insert(table, data) {
      const columns = Object.keys(data)
      const quoted = columns.map((column) => quoteIdent('mysql', column))
      const sql = `INSERT INTO ${table} (${quoted.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
      const [result] = await connection.query(sql, normalizeParams(Object.values(data)))
      return Number(result.insertId)
    },
  }
}

export default Db
