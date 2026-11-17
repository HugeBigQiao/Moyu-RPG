<script setup lang="ts">
/**
 * 遮掩层：盖住整页。
 *
 * 职责：
 *     blur 模式把下面的页面虚化，只留一句「已锁定」；fake 模式换成一份运维文档。
 * 为什么需要：
 *     这是「被人看见」时的兜底；两种遮法覆盖不同场合，快捷键与点击都能恢复。
 * 上下游：
 *     上游：shared/stealth.ts（covered / lastMode）；
 *     下游：app/App.vue 在 covered 时渲染本组件。
 */
import { computed } from 'vue'

import { HOTKEY_LABEL, reveal, stealth } from '../shared/stealth'

const mode = computed(() => stealth.lastMode || 'blur')

/** 伪装页里的假监控行；只求像内部文档，不含任何游戏词。 */
interface OpsRow {
  name: string
  p99: string
  qps: string
  state: string
}

const rows: OpsRow[] = [
  { name: 'order-gateway', p99: '42ms', qps: '1.2k', state: 'healthy' },
  { name: 'order-writer', p99: '68ms', qps: '860', state: 'healthy' },
  { name: 'inventory-sync', p99: '120ms', qps: '240', state: 'degraded' },
  { name: 'settlement-batch', p99: '—', qps: '12', state: 'idle' }
]

const logs: string[] = [
  '11:42:07  INFO  gateway      reload route table ok (nodes=6)',
  '11:42:11  INFO  writer       batch flush rows=2048 cost=73ms',
  '11:43:02  WARN  inventory    upstream lag 1.8s, keep last snapshot',
  '11:43:20  INFO  scheduler    next settlement at 02:00',
  '11:44:05  INFO  health       all probes green except inventory-sync'
]
</script>

<template>
  <div v-if="mode === 'blur'" class="stealth-blur" @click="reveal">
    <div class="stealth-lock">
      <div class="lock-glyph">◍</div>
      <div class="lock-text">已锁定</div>
      <div class="lock-hint">{{ HOTKEY_LABEL }} 或点击任意处恢复</div>
      <button class="stealth-back" @click.stop="reveal">← 返回</button>
    </div>
  </div>

  <div v-else class="stealth-fake">
    <header class="sf-top">
      <span class="sf-brand">GM-OPS</span>
      <span class="sf-title">订单中心 v2.3.1 · 运维手册</span>
      <span class="sf-meta">内部资料 · 禁止外传</span>
    </header>

    <div class="sf-body">
      <aside class="sf-side">
        <div class="sf-side-h">服务状态</div>
        <div v-for="r in rows" :key="r.name" class="sf-side-row">
          <span class="dot" :class="r.state === 'healthy' ? 'ok' : r.state === 'degraded' ? 'warn' : ''"></span>
          <span class="nm">{{ r.name }}</span>
          <span class="st">{{ r.state }}</span>
        </div>
      </aside>

      <main class="sf-main">
        <h1>订单中心 · 容量与稳定性巡检</h1>
        <p class="sf-lead">
          本文档由监控平台自动生成，记录当日核心链路的延迟、吞吐与批处理状态。
          变更请走发布单，禁止直接改生产配置。
        </p>

        <table class="sf-table">
          <thead><tr><th>服务</th><th>P99</th><th>QPS</th><th>状态</th></tr></thead>
          <tbody>
            <tr v-for="r in rows" :key="r.name">
              <td class="mono">{{ r.name }}</td>
              <td class="mono">{{ r.p99 }}</td>
              <td class="mono">{{ r.qps }}</td>
              <td><span class="sf-tag" :class="r.state">{{ r.state }}</span></td>
            </tr>
          </tbody>
        </table>

        <h2>今日日志摘要</h2>
        <pre class="sf-log">{{ logs.join('\n') }}</pre>

        <h2>变更记录</h2>
        <ul class="sf-list">
          <li>11:20 网关路由表重载，灰度 10% → 100%</li>
          <li>10:05 库存同步任务补跑，滞后已收敛至 0.4s</li>
          <li>09:30 结算批处理完成，核对差异 0 笔</li>
        </ul>
      </main>
    </div>

    <button class="sf-back" title="返回（Esc）" @click.stop="reveal">← 返回</button>
  </div>
</template>
