/**
 * 内容服务。
 *
 * 职责：
 *     持有 ContentStore 与索引后的内容；目录里的 JSON 变化时自动重读。
 * 为什么需要：
 *     Python 版靠手动调 reload；这里把「改文件即生效」做成默认行为，
 *     编辑器的写回与手工改 JSON 走同一条 reload 路径。
 * 上下游：
 *     上游：server/data/content；下游：core/sheet、plugins/api-*、/api/admin/reload。
 */
import { watch, type FSWatcher } from 'node:fs'
import { resolve } from 'node:path'
import { Service, type Context } from 'cordis'
import Schema from 'schemastery'
import { SERVER_ROOT } from '../config.ts'
import { CONTENT_FILES, loadContent, type ContentData } from '../content/index.ts'
import { ContentStore } from '../content/store.ts'
import { ContentEditor } from '../content/edit.ts'
import { saveContentFiles } from '../content/write.ts'

declare module 'cordis' {
  interface Context {
    content: Content
  }
}

export interface ContentConfig {
  dir: string
}

/** loader 用的插件配置：cordis 会在启动时校验并填默认值。 */
export const Config = Schema.object({
  dir: Schema.string().default('./data/content').description('内容 JSON 目录（相对 server/）'),
})

export class Content extends Service {
  static Config = Config
  readonly store: ContentStore
  data: ContentData
  private watcher?: FSWatcher
  /** 自己写盘时置位：watcher 触发的重读会跟 saveMany 里的 reload 重复 */
  private writing = false

  constructor(ctx: Context, config: ContentConfig) {
    super(ctx, 'content')
    this.store = new ContentStore(resolve(SERVER_ROOT, config.dir))
    this.data = loadContent(this.store)

    ctx.effect(() => {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        this.watcher = watch(this.store.dir, { persistent: false }, () => {
          if (this.writing) return
          // 一次保存常触发多个事件；debounce 后统一重读一次
          if (timer) clearTimeout(timer)
          timer = setTimeout(() => {
            timer = undefined
            try {
              this.reload()
            } catch {
              // 坏 JSON 已经在 store 里记录，保留上一份可用数据
            }
          }, 200)
        })
      } catch {
        // 目录不存在时不阻塞启动；load() 已经给出明确错误
      }
      return () => {
        if (timer) clearTimeout(timer)
        this.watcher?.close()
      }
    }, 'content.watch')
  }

  /** 强制重读全部内容；返回每个文件的状态。坏文件不覆盖上一份好数据。 */
  reload(): Record<string, string> {
    const report = this.store.reloadAll(CONTENT_FILES)
    try {
      this.data = loadContent(this.store)
    } catch {
      // 某个 JSON 坏了：保留上一份可用数据，错误已经写进 report / store.status()
    }
    report['sheet.traits'] = this.store.status().errors['sheet.traits'] ? 'error' : 'ok'
    return report
  }

  /** 档案编辑写回：落盘后整体重载。 */
  saveMany(documents: Record<string, any>): Record<string, string> {
    this.writing = true
    try {
      saveContentFiles(this.store, documents)
      return this.reload()
    } finally {
      this.writing = false
    }
  }

  editor(): ContentEditor {
    return new ContentEditor(this.store, (documents) => this.saveMany(documents))
  }

  status() {
    return this.store.status()
  }
}

export default Content
