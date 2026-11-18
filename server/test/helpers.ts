/**
 * 测试辅助：定位 fixtures 与内容目录。
 *
 * 为什么不用 cwd：vitest 的 cwd 是 server/，但脚本也可能从仓库根跑；
 * 用 import.meta.dirname 钉死相对位置，测试才不依赖启动目录。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SERVER_ROOT = resolve(import.meta.dirname, '..')
export const CONTENT_DIR = resolve(SERVER_ROOT, 'data/content')

export function fixture<T = unknown>(name: string): T {
  const path = resolve(SERVER_ROOT, 'test/fixtures', name)
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

export function content<T = unknown>(name: string): T {
  const path = resolve(CONTENT_DIR, `${name}.json`)
  return JSON.parse(readFileSync(path, 'utf8')) as T
}
