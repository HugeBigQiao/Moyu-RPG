/**
 * 运行时路径与应用配置类型。
 *
 * 职责：
 *     给出 server/ 与仓库根的绝对路径；定义 createApp 用的配置结构。
 * 为什么需要：
 *     生产配置已由 cordis.yml + loader 注入（含 schemastery 校验），
 *     这里不再重复一套环境变量解析；测试直接构造 AppConfig 即可。
 * 上下游：
 *     上游：无（纯路径常量）；下游：src/index.ts、src/app.ts、各插件。
 */
import { resolve } from 'node:path'

export const SERVER_ROOT = resolve(import.meta.dirname, '..')

/** 一条装配路径的配置：生产由 loader 注入，测试手工构造。 */
export interface AppConfig {
  host: string
  port: number
  contentDir: string
  databaseUrl: string
  frontendDist: string
}
