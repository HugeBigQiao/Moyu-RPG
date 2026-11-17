/**
 * 应用装配。
 *
 * 职责：
 *     创建 cordis Context，按依赖顺序装 content / db / rules / http，
 *     注册健康检查、内容状态与重载接口；返回可关闭的句柄供测试使用。
 * 为什么需要：
 *     index.ts 只负责读配置与进程生命周期；测试要能在随机端口起停，不能 import 就 listen。
 * 上下游：
 *     上游：config.ts、plugins/*；下游：index.ts、test/*。
 */
import { Context, type Fiber } from 'cordis'
import type { Config } from './config.ts'
import { Db } from './db/client.ts'
import { Content } from './plugins/content.ts'
import { HttpServer, sendJson } from './plugins/http.ts'
import { Rules } from './plugins/rules.ts'
import { Api } from './plugins/api.ts'

export interface AppHandle {
  app: Context
  close(): Promise<void>
}

export async function createApp(config: Config): Promise<AppHandle> {
  const app = new Context()
  const fibers: Fiber[] = []

  fibers.push(await app.use(Content, { dir: config.contentDir }))
  fibers.push(await app.use(Db, { url: config.databaseUrl }))
  await (app.get('db') as Db).ready
  fibers.push(await app.use(Rules))
  const httpFiber = await app.use(HttpServer, {
    host: config.host,
    port: config.port,
    dist: config.frontendDist,
  })
  fibers.push(httpFiber)
  fibers.push(await app.use(Api))

  const content = app.get('content') as Content
  const server = app.get('server') as HttpServer
  await server.ready

  server.get('/api/health', (_req, res) => {
    sendJson(res, 200, {
      ok: true,
      port: server.port,
      services: {
        content: !!app.get('content'),
        db: !!app.get('db'),
        rules: !!app.get('rules'),
      },
      content: content.status(),
    })
  })

  return {
    app,
    close: async () => {
      for (const fiber of fibers.reverse()) {
        await fiber.dispose()
      }
    },
  }
}
