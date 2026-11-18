/**
 * 健康检查接口。
 *
 * 职责：
 *     提供 GET /api/health：返回端口、三个核心服务是否就绪、内容文件状态。
 * 为什么需要：
 *     启动脚本用它在启动前探活；它也把「装配是否完整」变成一个可 curl 的响应。
 *     原先这段写在 app.ts 里，改成插件后 loader 与 createApp 两条装配路径共用同一份。
 * 上下游：
 *     上游：plugins/http（路由）、plugins/content（内容状态）；
 *     下游：start 脚本、api 冒烟、运维手查。
 */
import { Service, type Context } from 'cordis'
import type { Content } from './content.ts'
import { sendJson, type HttpServer } from './http.ts'

declare module 'cordis' {
  interface Context {
    health: Health
  }
}

export class Health extends Service {
  static inject = ['server', 'content']

  constructor(ctx: Context) {
    super(ctx, 'health')
    const server = ctx.get('server') as HttpServer

    server.get('/api/health', (_req, res) => {
      sendJson(res, 200, {
        ok: true,
        port: server.port,
        services: {
          content: !!ctx.get('content'),
          db: !!ctx.get('db'),
          rules: !!ctx.get('rules'),
        },
        content: (ctx.get('content') as Content).status(),
      })
    })
  }
}

export default Health
