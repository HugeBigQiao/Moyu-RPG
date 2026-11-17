/**
 * 内容写回。
 *
 * 职责：
 *     把一份或多份内容文件原子地写回 data/content/，先写临时文件再 rename。
 * 为什么需要：
 *     档案页要能增删改，但设定只有 JSON 这一份真相；直接覆盖会留下半截文件。
 * 上下游：
 *     上游：content/edit（已校验的整份数据）；下游：data/content/*.json、plugins/content.reload。
 */
import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, unlinkSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import type { Doc } from './index.ts'
import type { ContentStore } from './store.ts'

/** 一次写多个内容文件；任何一份失败都抛异常，已写的保持新内容。 */
export function saveContentFiles(store: ContentStore, documents: Record<string, Doc>): void {
  mkdirSync(store.dir, { recursive: true })
  for (const [name, data] of Object.entries(documents)) {
    writeOne(store, name, data)
  }
}

function writeOne(store: ContentStore, name: string, data: Doc): void {
  const path = join(store.dir, `${name}.json`)
  // 与现有文件一致的格式：2 空格缩进、中文不转义、结尾换行；git diff 只显示真正改动的行
  const text = JSON.stringify(data, null, 2) + '\n'
  const temp = join(store.dir, `.${name}-${process.pid}-${Date.now()}.tmp`)

  let fd: number | undefined
  try {
    fd = openSync(temp, 'w')
    writeSync(fd, text, 0, 'utf8')
    fsyncSync(fd)
    closeSync(fd)
    fd = undefined
    renameSync(temp, path)
  } catch (error) {
    if (fd !== undefined) {
      try { closeSync(fd) } catch { /* 已关闭就忽略 */ }
    }
    try { unlinkSync(temp) } catch { /* 临时文件可能不存在 */ }
    throw error
  }
}
