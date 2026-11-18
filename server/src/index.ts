/**
 * 进程入口（cordis loader 装配）。
 *
 * 职责：
 *     创建 Context，挂 Fs / NodeFs / Loader，读取 cordis.yml，
 *     等 server 服务就绪后打印地址；Ctrl+C 时反向释放各插件。
 * 为什么需要：
 *     L1：把「有哪些插件、各配什么」从 app.ts 的手写 use 顺序搬进配置文件，
 *     加载顺序交给 inject 图。createApp 仍保留给测试（随机端口、无进程副作用）。
 * 上下游：
 *     上游：cordis.yml；下游：plugins/*（由 loader 读取并装配）。
 */
import { pathToFileURL } from 'node:url'

import { Context } from 'cordis'
import Fs from '@cordisjs/fs'
import NodeFs from '@cordisjs/fs-node'
import Loader from '@cordisjs/loader'

import { SERVER_ROOT } from './config.ts'
import type { HttpServer } from './plugins/http.ts'

const ctx = new Context()
// 插件名与 cordis.yml 都按 server/ 解析，这样从任何目录启动都不依赖 cwd
ctx.baseUrl = pathToFileURL(SERVER_ROOT).href + '/'

/**
 * 等某个服务注册完成。
 *
 * 参数：
 *     name：服务名（如 server / db）；timeoutMs：超时时间。
 * 为什么需要：
 *     include 读配置文件是异步的；`create()` 返回时插件未必已经加载完，
 *     直接读 ctx.server 会拿到 undefined。
 * 输出：
 *     服务实例；超时或配置错误时 reject。
 */
function waitForService<T>(name: string, timeoutMs = 5_000): Promise<T> {
  const existing = ctx.get(name) as T | undefined
  if (existing) return Promise.resolve(existing)
  return new Promise<T>((resolveService, reject) => {
    const timer = setTimeout(() => reject(new Error(`等待服务 ${name} 超时（配置或插件加载失败）`)), timeoutMs)
    const dispose = ctx.on('internal/service', (serviceName, value) => {
      if (serviceName !== name) return
      clearTimeout(timer)
      dispose()
      resolveService(value as T)
    })
  })
}

let stopping = false

/** 关停：loader 条目按创建顺序反向释放，DB 连接与 watcher 都会走自己的 disposer。 */
async function shutdown(signal: string): Promise<void> {
  if (stopping) return
  stopping = true
  console.log(`\n[moyu] 收到 ${signal}，正在关闭…`)
  for (const entry of [...ctx.loader.entries()].reverse()) {
    try {
      await entry.dispose()
    } catch (error) {
      console.error(`[moyu] 释放插件失败：${(error as Error).message}`)
    }
  }
  process.exit(0)
}

async function main(): Promise<void> {
  // 启动脚本用 MOYU_PORT 覆盖 YAML；这里先挡一道，避免 NaN 一路走到监听阶段
  const envPort = process.env.MOYU_PORT
  if (envPort !== undefined) {
    const port = Number(envPort)
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      throw new Error(`MOYU_PORT 不合法：${envPort}（要求 0–65535 的整数）`)
    }
  }

  await ctx.use(Fs)
  await ctx.use(NodeFs)
  await ctx.use(Loader)
  await ctx.loader.create({
    name: '@cordisjs/include',
    config: { path: './cordis.yml' },
  })

  const server = await waitForService<HttpServer>('server')
  console.log(`[moyu] 服务已启动：http://${server.host}:${server.port}`)

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch((error) => {
  console.error(`[moyu] 启动失败：${(error as Error).message}`)
  console.error('[moyu] 检查 server/cordis.yml 与 MOYU_* 环境变量')
  process.exit(1)
})
