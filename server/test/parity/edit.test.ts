/**
 * 档案编辑对拍：11 类档案的创建 / 更新 / 删除 / 校验报错。
 *
 * 在临时目录里跑，不碰仓库里的 content；save 回调负责原子写回与清缓存。
 */
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CONTENT_FILES } from '../../src/content/index.ts'
import { ContentEditor, EditError } from '../../src/content/edit.ts'
import { ContentStore } from '../../src/content/store.ts'
import { saveContentFiles } from '../../src/content/write.ts'
import { CONTENT_DIR, fixture } from '../helpers.ts'

interface EditOp {
  kind: string
  created: Record<string, any>
  updated: Record<string, any>
  removed: Record<string, any>
  count: number
  invalid: string | null
}

const data = fixture<{ ops: EditOp[]; refusals: Array<{ kind: string; id: string; error: string | null }> }>('edit.json')
const plain = (value: unknown) => JSON.parse(JSON.stringify(value))

let tempDir: string
let editor: ContentEditor

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'moyu-edit-test-'))
  cpSync(CONTENT_DIR, tempDir, { recursive: true })
  const store = new ContentStore(tempDir)
  editor = new ContentEditor(store, (documents) => {
    saveContentFiles(store, documents)
    store.reloadAll(CONTENT_FILES)
  })
})

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('档案编辑对拍', () => {
  for (const op of data.ops) {
    it(`${op.kind} 增改删`, () => {
      const first = editor.items(op.kind)[0]
      const payload = { ...first }
      if (op.kind === 'traits') payload.name = `${payload.name}甲`
      else payload.id = `${payload.id}_x`

      const created = editor.create(op.kind, payload)
      expect(plain(created)).toEqual(op.created)

      const updatedPayload = { ...created }
      if (op.kind === 'traits') updatedPayload.desc = `${updatedPayload.desc ?? ''}改`
      else if ('name' in created) updatedPayload.name = `${created.name}改`
      else if ('title' in created) updatedPayload.title = `${created.title}改`
      const itemId = op.kind === 'traits' ? created.name : created.id
      const updated = editor.update(op.kind, itemId, updatedPayload)
      expect(plain(updated)).toEqual(op.updated)

      const removed = editor.remove(op.kind, itemId)
      expect(plain(removed)).toEqual(op.removed)
      expect(editor.count(op.kind)).toBe(op.count)

      if (op.invalid !== null) {
        try {
          editor.create(op.kind, {})
          throw new Error('应当校验失败')
        } catch (error) {
          expect(error).toBeInstanceOf(EditError)
          expect((error as Error).message).toBe(op.invalid)
        }
      }
    })
  }

  for (const row of data.refusals) {
    it(`拒绝删除 ${row.kind}/${row.id}`, () => {
      if (row.error === null) {
        expect(() => editor.remove(row.kind, row.id)).not.toThrow()
      } else {
        expect(() => editor.remove(row.kind, row.id)).toThrow(row.error)
      }
    })
  }
})
