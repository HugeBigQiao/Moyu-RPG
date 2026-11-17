/**
 * 内容服务。
 *
 * 职责：
 *     持有 ContentStore 与索引后的内容；目录变化时广播 content/reload。
 * 为什么需要：
 *     Python 版靠模块级全局 + register 回调；这里收成一个 Service，
 *     生命周期交给 ctx，热重载用事件广播。
 * 上下游：
 *     上游：backend/data/content；下游：core/sheet、plugins/api-*、/api/admin/reload。
 */
import { watch, type FSWatcher } from 'node:fs'
import { Service, type Context } from 'cordis'
import { CONTENT_FILES, loadContent, type ContentData } from '../content/index.ts'
import { ContentStore } from '../content/store.ts'
import { ContentEditor } from '../content/edit.ts'
import { saveContentFiles } from '../content/write.ts'

declare module 'cordis' {
  interface Events {
    'content/reload'(): void
  }

  interface Context {
    content: Content
  }
}

export interface ContentConfig {
  dir: string
}

export class Content extends Service {
  readonly store: ContentStore
  data: ContentData
  private watcher?: FSWatcher

  constructor(ctx: Context, config: ContentConfig) {
    super(ctx, 'content')
    this.store = new ContentStore(config.dir)
    this.data = loadContent(this.store)

    ctx.effect(() => {
      try {
        this.watcher = watch(this.store.dir, { persistent: false }, () => {
          // 编辑器保存常触发多次事件；真正重读由 reload() 统一做
          ctx.emit('content/reload')
        })
      } catch {
        // 目录不存在时不阻塞启动；load() 已经给出明确错误
      }
      return () => this.watcher?.close()
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
    this.ctx.emit('content/reload')
    return report
  }

  /** 档案编辑写回：落盘后整体重载。 */
  saveMany(documents: Record<string, any>): Record<string, string> {
    saveContentFiles(this.store, documents)
    return this.reload()
  }

  editor(): ContentEditor {
    return new ContentEditor(this.store, (documents) => this.saveMany(documents))
  }

  status() {
    return this.store.status()
  }
}
