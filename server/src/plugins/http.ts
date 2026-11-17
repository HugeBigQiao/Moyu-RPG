/**
 * HTTP 服务（node:http）。
 *
 * 职责：
 *     路由、JSON 请求/响应、静态产物与缓存头、统一 404/500。
 * 为什么自研而不用 @cordisjs/plugin-server：
 *     1.7.0 与 cordis rc.12+ 不兼容（Route 构造调用已被移除的 Service.resolveConfig）；
 *     后端需要的 HTTP 能力很少，自研一层反而可控，也避免被 RC 生态的破窗拖住。
 * 上下游：
 *     上游：cordis Context；下游：plugins/api-*、前端 dist。
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { Service, type Context } from 'cordis'

declare module 'cordis' {
  interface Context {
    server: HttpServer
  }
}

export interface HttpConfig {
  host: string
  port: number
  dist: string
  maxBody?: number
}

export interface HttpRequest extends IncomingMessage {
  params: Record<string, string>
  query: URLSearchParams
  json<T = unknown>(): Promise<T>
}

export type Handler = (req: HttpRequest, res: ServerResponse) => Promise<void> | void

interface Route {
  method: string
  segments: string[]
  handler: Handler
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

const NO_STORE = 'no-store, no-cache, must-revalidate, max-age=0'
const IMMUTABLE = 'public, max-age=31536000, immutable'

function splitPath(path: string): string[] {
  return path.split('/').filter(Boolean)
}

function matchPath(segments: string[], pathname: string): Record<string, string> | null {
  const parts = splitPath(pathname)
  if (parts.length !== segments.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (segment.startsWith(':')) {
      params[segment.slice(1)] = decodeURIComponent(parts[i])
    } else if (segment !== parts[i]) {
      return null
    }
  }
  return params
}

export function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': MIME['.json'],
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

export class HttpServer extends Service {
  readonly config: HttpConfig
  private routes: Route[] = []
  private server: Server
  readonly ready: Promise<void>
  private resolveReady!: () => void

  constructor(ctx: Context, config: HttpConfig) {
    super(ctx, 'server')
    this.config = config
    this.server = createServer((req, res) => void this.dispatch(req, res))
    this.ready = new Promise<void>((resolveReady) => { this.resolveReady = resolveReady })

    ctx.effect(async () => {
      await new Promise<void>((resolveListen, rejectListen) => {
        const onError = (error: Error) => rejectListen(error)
        this.server.once('error', onError)
        this.server.listen(config.port, config.host, () => {
          this.server.off('error', onError)
          resolveListen()
        })
      })
      this.resolveReady()
      ctx.logger('http').info('listening on http://%s:%d', config.host, this.port)
      return async () => {
        await new Promise<void>((resolveClose) => this.server.close(() => resolveClose()))
      }
    }, 'http.listen')
  }

  get port(): number {
    const address = this.server.address()
    return typeof address === 'object' && address ? address.port : this.config.port
  }

  get host(): string {
    return this.config.host
  }

  get(path: string, handler: Handler): void {
    this.add('GET', path, handler)
  }

  post(path: string, handler: Handler): void {
    this.add('POST', path, handler)
  }

  put(path: string, handler: Handler): void {
    this.add('PUT', path, handler)
  }

  delete(path: string, handler: Handler): void {
    this.add('DELETE', path, handler)
  }

  private add(method: string, path: string, handler: Handler): void {
    this.routes.push({ method, segments: splitPath(path), handler })
  }

  private async dispatch(raw: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(raw.url ?? '/', 'http://127.0.0.1')
    const pathname = decodeURIComponent(url.pathname)
    const isApi = pathname === '/api' || pathname.startsWith('/api/')

    for (const route of this.routes) {
      if (route.method !== raw.method) continue
      const params = matchPath(route.segments, pathname)
      if (!params) continue

      const req = raw as HttpRequest
      req.params = params
      req.query = url.searchParams
      req.json = (async <T>() => {
        const chunks: Buffer[] = []
        let size = 0
        const limit = this.config.maxBody ?? 1024 * 1024
        for await (const chunk of raw) {
          size += (chunk as Buffer).length
          if (size > limit) throw new Error('请求体太大')
          chunks.push(chunk as Buffer)
        }
        const text = Buffer.concat(chunks).toString('utf8')
        return (text ? JSON.parse(text) : {}) as T
      }) as HttpRequest['json']

      try {
        await route.handler(req, res)
      } catch (error) {
        ctxError(this.ctx, error)
        if (!res.headersSent) sendJson(res, 500, { detail: (error as Error).message })
      }
      return
    }

    if ((raw.method === 'GET' || raw.method === 'HEAD') && !isApi) {
      if (this.serveStatic(pathname, res)) return
    }
    sendJson(res, 404, { detail: isApi ? '接口不存在' : '页面不存在' })
  }

  private serveStatic(pathname: string, res: ServerResponse): boolean {
    const dist = resolve(this.config.dist)
    const index = resolve(dist, 'index.html')
    const target = resolve(dist, `.${pathname}`)
    if (target !== dist && !target.startsWith(dist + sep)) return false

    const isAsset = pathname.startsWith('/assets/')
    if (existsSync(target) && statSync(target).isFile()) {
      this.sendFile(res, target, isAsset ? IMMUTABLE : NO_STORE)
      return true
    }
    // SPA 兜底：index.html 必须 no-store，否则会被浏览器缓存，一直加载旧 bundle
    if (existsSync(index)) {
      this.sendFile(res, index, NO_STORE)
      return true
    }
    return false
  }

  private sendFile(res: ServerResponse, file: string, cache: string): void {
    const stat = statSync(file)
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': cache,
    })
    createReadStream(file).pipe(res)
  }
}

function ctxError(ctx: Context, error: unknown): void {
  // 没有挂 console exporter 时 logger 只缓冲；至少把堆栈打到 stderr，便于本地排查
  console.error('[http]', error)
  ctx.logger('http').warn('%s', (error as Error)?.stack ?? String(error))
}
