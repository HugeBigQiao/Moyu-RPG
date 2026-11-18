/**
 * 内容加载器。
 *
 * 职责：
 *     按 mtime 读缓存 data/content/*.json，提供 reload 与错误收集。
 * 为什么需要：
 *     设定必须可改而不重启；坏 JSON 要有一个明确的报错点。
 * 上下游：
 *     上游：backend/data/content/*.json；下游：content/index.ts、plugins/content.ts。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

class ContentError extends Error {}

export class ContentStore {
  readonly dir: string
  private cache = new Map<string, { mtime: number; data: unknown }>()
  private errors = new Map<string, string>()

  constructor(dir: string) {
    this.dir = dir
  }

  pathOf(name: string): string {
    return join(this.dir, `${name}.json`)
  }

  load<T = unknown>(name: string, force = false): T {
    const path = this.pathOf(name)
    let mtime: number
    try {
      mtime = statSync(path).mtimeMs
    } catch {
      throw new ContentError(`缺少内容文件：${path}`)
    }

    const cached = this.cache.get(name)
    if (cached && cached.mtime === mtime && !force) return cached.data as T

    try {
      const data = JSON.parse(readFileSync(path, 'utf8')) as T
      this.cache.set(name, { mtime, data })
      this.errors.delete(name)
      return data
    } catch (error) {
      const message = `${name}.json 不是合法 JSON：${(error as Error).message}`
      this.errors.set(name, message)
      throw new ContentError(message)
    }
  }

  reloadAll(names: readonly string[]): Record<string, string> {
    this.cache.clear()
    const report: Record<string, string> = {}
    for (const name of names) {
      try {
        this.load(name, true)
        report[name] = 'ok'
      } catch (error) {
        // 一个文件坏了不该拖垮别的
        report[name] = `error: ${(error as Error).message}`
      }
    }
    return report
  }

  status() {
    return {
      dir: this.dir,
      files: readdirSync(this.dir).filter((name) => name.endsWith('.json')).sort(),
      errors: Object.fromEntries(this.errors),
    }
  }
}
