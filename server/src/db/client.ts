/**
 * 数据库服务。
 *
 * 职责：
 *     打开 SQLite、设置 PRAGMA、执行基线建表、提供事务与关闭钩子。
 * 为什么需要：
 *     引擎不碰数据库；所有读写都从这里过，事务边界才清晰。
 *     Node 26 内置 node:sqlite，零原生依赖、零编译，单机单人够用。
 * 上下游：
 *     上游：config.dbFile；下游：plugins/api-*、plugins/game。
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Service, type Context } from 'cordis'

declare module 'cordis' {
  interface Context {
    db: Db
  }
}

export interface DbConfig {
  file: string
}

export class Db extends Service {
  readonly db: DatabaseSync
  readonly file: string

  constructor(ctx: Context, config: DbConfig) {
    super(ctx, 'db')
    this.file = config.file
    mkdirSync(dirname(config.file), { recursive: true })
    this.db = new DatabaseSync(config.file)

    // SQLite 默认不校验外键；WAL 让读写不互相阻塞。与 Python 版保持同一组设置。
    this.db.exec('PRAGMA foreign_keys = ON')
    this.db.exec('PRAGMA journal_mode = WAL')
    this.migrate()

    ctx.effect(() => () => {
      try {
        this.db.close()
      } catch {
        // 已经关闭就忽略；dispose 可能被调用两次
      }
    }, 'db.close')
  }

  /** 应用基线建表；用 user_version 记录是否已初始化。 */
  migrate(): void {
    const schema = readFileSync(resolve(import.meta.dirname, 'schema.sql'), 'utf8')
    this.db.exec(schema)
    const row = this.db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined
    if (!row?.user_version) this.db.exec('PRAGMA user_version = 1')
  }

  /** 同步事务：回调抛错就回滚。 */
  transaction<T>(callback: () => T): T {
    this.db.exec('BEGIN')
    try {
      const result = callback()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
}
