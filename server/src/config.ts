/**
 * 运行时配置。
 *
 * 职责：
 *     从环境变量读监听地址、内容目录、数据库文件与前端产物目录，并给默认值。
 * 为什么需要：
 *     Python 版靠 pydantic-settings；Node 版用 zod 把「环境变量 → 类型」收敛到一处，
 *     启动时就失败，而不是运行到一半才发现路径不对。
 * 上下游：
 *     上游：process.env / server/.env（暂不自动加载）；下游：index.ts、各插件。
 */
import { resolve } from 'node:path'
import { z } from 'zod'

const SERVER_ROOT = resolve(import.meta.dirname, '..')
export const PROJECT_ROOT = resolve(SERVER_ROOT, '..')

export const Config = z.object({
  host: z.string().default('127.0.0.1'),
  port: z.number().int().min(0).max(65535).default(8888),
  contentDir: z.string().default(resolve(PROJECT_ROOT, 'backend/data/content')),
  dbFile: z.string().default(resolve(PROJECT_ROOT, 'backend/data/moyu.db')),
  frontendDist: z.string().default(resolve(PROJECT_ROOT, 'frontend/dist')),
})

export type Config = z.infer<typeof Config>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return Config.parse({
    host: env.MOYU_HOST,
    port: env.MOYU_PORT ? Number(env.MOYU_PORT) : undefined,
    contentDir: env.MOYU_CONTENT_DIR,
    dbFile: env.MOYU_DB_FILE,
    frontendDist: env.MOYU_FRONTEND_DIST,
  })
}
