/** 数据库 URL 解析：三种方言的写法都要认。 */
import { describe, expect, it } from 'vitest'
import { parseDatabaseUrl, quoteIdent, sqliteUrl } from '../src/db/client.ts'

describe('数据库 URL', () => {
  it('sqlite 路径', () => {
    expect(parseDatabaseUrl('sqlite:///tmp/moyu.db')).toEqual({ dialect: 'sqlite', file: '/tmp/moyu.db' })
    expect(parseDatabaseUrl('sqlite://./data.db')).toEqual({ dialect: 'sqlite', file: './data.db' })
    expect(parseDatabaseUrl('sqlite:data.db')).toEqual({ dialect: 'sqlite', file: 'data.db' })
    expect(parseDatabaseUrl(sqliteUrl('/tmp/a.db'))).toEqual({ dialect: 'sqlite', file: '/tmp/a.db' })
  })

  it('postgres 与 mysql 原样保留连接串', () => {
    expect(parseDatabaseUrl('postgresql://u:p@localhost:5432/moyu').dialect).toBe('postgresql')
    expect(parseDatabaseUrl('postgres://u:p@localhost/moyu').dialect).toBe('postgresql')
    expect(parseDatabaseUrl('mysql://u:p@localhost:3306/moyu').dialect).toBe('mysql')
  })

  it('标识符按方言加引号', () => {
    expect(quoteIdent('sqlite', 'rank')).toBe('"rank"')
    expect(quoteIdent('postgresql', 'rank')).toBe('"rank"')
    expect(quoteIdent('mysql', 'rank')).toBe('`rank`')
  })
})
