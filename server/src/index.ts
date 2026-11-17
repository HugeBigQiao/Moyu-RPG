/**
 * 进程入口。
 *
 * 职责：
 *     读配置、装配应用、打印监听地址、处理 Ctrl+C 退出。
 * 为什么需要：
 *     createApp 保持无副作用，入口只做进程级的事，测试才能复用装配逻辑。
 * 上下游：
 *     上游：config.ts、app.ts；下游：Node 进程。
 */
import { loadConfig } from './config.ts'
import { createApp } from './app.ts'
import type { HttpServer } from './plugins/http.ts'

const config = loadConfig()
const { app, close } = await createApp(config)
const server = app.get('server') as HttpServer

console.log(`[moyu] 服务已启动：http://${config.host}:${server.port}`)

let stopping = false
async function shutdown(signal: string): Promise<void> {
  if (stopping) return
  stopping = true
  console.log(`\n[moyu] 收到 ${signal}，正在关闭…`)
  await close()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
