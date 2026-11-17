/**
 * 三张表的行映射与小查询。
 *
 * 职责：
 *     DB 行 → 引擎 dict；角色/会话的插入与更新；JSON 列的编解码。
 * 为什么需要：
 *     业务层不应该到处 JSON.parse；字段默认值也只在这里补一次。
 * 上下游：
 *     上游：db/client；下游：api/*、game。
 */
import type { CharacterLike } from '../core/types.ts'
import type { SessionState } from '../core/session.ts'
import { jsonValue, nowStamp, parseJson, quoteIdent } from './client.ts'

export interface CharacterRow {
  id: number
  code: string
  name: string
  school: string
  element: string
  rarity: string
  rank: string
  merit: number
  attrs: Record<string, number>
  traits: any[]
  approval: Record<string, number>
  notes: string
  seed: string
  kind: string
  city: string
  events: string[]
  mission: string | null
  difficulty: number
  reward: number
  completed_sessions: number
  karma_good: number
  karma_debt: number
  mind_trial_passed: boolean
  trial_attempts: number
  items: any[]
  ascensions: any[]
  created_at: string
  [key: string]: any
}

export interface SessionRow {
  id: number
  code: string
  character_id: number
  scenario_id: string
  status: string
  state: SessionState
  seed: string
  rules_version: number
  created_at: string
  updated_at: string
  [key: string]: any
}

export function rowToCharacter(row: any): CharacterRow {
  return {
    ...row,
    attrs: parseJson(row.attrs, {}),
    traits: parseJson(row.traits, []),
    approval: parseJson(row.approval, {}),
    events: parseJson(row.events, []),
    items: parseJson(row.items, []),
    ascensions: parseJson(row.ascensions, []),
    mind_trial_passed: Boolean(row.mind_trial_passed),
    mission: row.mission ?? null,
    completed_sessions: Number(row.completed_sessions ?? 0),
    karma_good: Number(row.karma_good ?? 0),
    karma_debt: Number(row.karma_debt ?? 0),
    trial_attempts: Number(row.trial_attempts ?? 0),
  }
}

export function rowToSession(row: any): SessionRow {
  return {
    ...row,
    state: parseJson(row.state, {}),
    rules_version: Number(row.rules_version ?? 1),
  }
}

/** ORM 对象 -> 引擎认的纯 dict。 */
export function cardOf(ch: CharacterRow): CharacterLike {
  return {
    school: ch.school,
    element: ch.element,
    rank: ch.rank,
    attrs: ch.attrs ?? {},
    traits: ch.traits ?? [],
    approval: ch.approval ?? {},
    merit: ch.merit,
    items: ch.items ?? [],
    completed_sessions: ch.completed_sessions ?? 0,
    karma_good: ch.karma_good ?? 0,
    karma_debt: ch.karma_debt ?? 0,
    mind_trial_passed: Boolean(ch.mind_trial_passed),
  }
}

export interface CharacterInput {
  code: string
  name: string
  school: string
  element: string
  rarity: string
  rank: string
  merit: number
  attrs: Record<string, number>
  traits: any[]
  approval: Record<string, number>
  notes: string
  seed: string
  kind?: string
  city?: string
  events?: string[]
  mission?: string | null
  difficulty?: number
  reward?: number
}

export async function insertCharacter(db: { insert: Function }, built: CharacterInput): Promise<number> {
  return db.insert('characters', {
    code: built.code,
    name: built.name,
    school: built.school,
    element: built.element,
    rarity: built.rarity,
    rank: built.rank,
    merit: built.merit,
    attrs: jsonValue(built.attrs),
    traits: jsonValue(built.traits),
    approval: jsonValue(built.approval),
    notes: built.notes,
    seed: built.seed,
    kind: built.kind ?? 'npc',
    city: built.city ?? 'nanyu',
    events: jsonValue(built.events ?? []),
    mission: built.mission ?? null,
    difficulty: built.difficulty ?? 1,
    reward: built.reward ?? 5,
    completed_sessions: 0,
    karma_good: 0,
    karma_debt: 0,
    mind_trial_passed: 0,
    trial_attempts: 0,
    items: jsonValue([]),
    ascensions: jsonValue([]),
    created_at: nowStamp(),
  })
}

const JSON_COLUMNS = new Set(['attrs', 'traits', 'approval', 'events', 'items', 'ascensions', 'state', 'payload', 'scenario'])

export async function updateCharacter(db: { run: Function; dialect?: string }, id: number, patch: Record<string, any>): Promise<void> {
  const keys = Object.keys(patch)
  if (!keys.length) return
  const columns = keys.map((key) => `${quoteIdent((db.dialect ?? 'sqlite') as any, key)} = ?`).join(', ')
  const values = keys.map((key) => {
    const value = patch[key]
    if (JSON_COLUMNS.has(key)) return jsonValue(value)
    if (typeof value === 'boolean') return value ? 1 : 0
    return value
  })
  await db.run(`UPDATE characters SET ${columns} WHERE id = ?`, [...values, id])
}

export async function getCharacter(db: { get: Function }, id: number): Promise<CharacterRow | undefined> {
  const row = await db.get('SELECT * FROM characters WHERE id = ?', [id])
  return row ? rowToCharacter(row) : undefined
}

export async function listCharacters(db: { all: Function }, limit?: number, order = 'id DESC'): Promise<CharacterRow[]> {
  const sql = `SELECT * FROM characters ORDER BY ${order}${limit ? ` LIMIT ${Number(limit)}` : ''}`
  const rows = await db.all(sql)
  return rows.map(rowToCharacter)
}

export async function insertSession(
  db: { insert: Function; run: Function },
  data: {
    code: string
    character_id: number
    scenario_id: string
    status: string
    state: SessionState
    seed: string
  },
): Promise<number> {
  const now = nowStamp()
  return db.insert('sessions', {
    code: data.code,
    character_id: data.character_id,
    scenario_id: data.scenario_id,
    status: data.status,
    state: jsonValue(data.state),
    seed: data.seed,
    rules_version: 1,
    created_at: now,
    updated_at: now,
  })
}

export async function getSession(db: { get: Function }, id: number): Promise<SessionRow | undefined> {
  const row = await db.get('SELECT * FROM sessions WHERE id = ?', [id])
  return row ? rowToSession(row) : undefined
}

export async function updateSession(db: { run: Function; dialect?: string }, id: number, patch: Record<string, any>): Promise<void> {
  const keys = Object.keys(patch)
  const columns = keys.map((key) => `${quoteIdent((db.dialect ?? 'sqlite') as any, key)} = ?`).join(', ')
  const values = keys.map((key) => {
    const value = patch[key]
    if (key === 'state') return jsonValue(value)
    return value
  })
  await db.run(`UPDATE sessions SET ${columns}, updated_at = ? WHERE id = ?`, [...values, nowStamp(), id])
}

export async function insertLog(
  db: { insert: Function },
  sessionId: number,
  seq: number,
  item: { kind: string; severity: string; text: string; payload?: Record<string, any> },
): Promise<void> {
  await db.insert('session_logs', {
    session_id: sessionId,
    seq,
    kind: item.kind,
    severity: item.severity,
    text: item.text,
    payload: jsonValue(item.payload ?? {}),
    created_at: nowStamp(),
  })
}

export async function nextLogSeq(db: { get: Function }, sessionId: number): Promise<number> {
  const row: { seq: number | null } | undefined = await db.get(
    'SELECT MAX(seq) AS seq FROM session_logs WHERE session_id = ?', [sessionId],
  )
  return Number(row?.seq ?? 0) + 1
}
