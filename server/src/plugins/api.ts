/**
 * API 插件。
 *
 * 职责：
 *     等 content/db/rules/server 就绪后，一次性注册所有 /api 路由。
 * 为什么需要：
 *     路由分板块写（archive/characters/game/sessions），但装配点只有一个；
 *     inject 声明依赖，避免「先注册路由、服务还没起」的时序问题。
 * 上下游：
 *     上游：plugins/{content,db,rules,http}；下游：前端。
 */
import { Service, type Context } from 'cordis'
import { registerAll } from '../api/index.ts'

declare module 'cordis' {
  interface Context {
    api: Api
  }
}

export class Api extends Service {
  static inject = ['server', 'content', 'db', 'rules']

  constructor(ctx: Context) {
    super(ctx, 'api')
    registerAll(ctx)
  }
}
