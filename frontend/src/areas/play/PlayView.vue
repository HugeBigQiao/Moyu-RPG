<script setup lang="ts">
/**
 * 处置台：一局的全部操作与信息。
 *
 * 职责：
 *     把当前场景、指标、敌方状态、可用操作与事件流摆在一屏；
 *     用户点一个操作，提交给后端并把新事件追加进事件流。
 * 为什么需要：
 *     跑团的节奏全在这一页；它只做「展示 + 转发动作」，规则在 engine/session.py。
 * 上下游：
 *     上游：/api/sessions/{id} 与 /api/sessions/{id}/act；
 *     下游：MeterBar（指标）、EventStream（事件流）。
 */
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import EventStream from './EventStream.vue'
import MeterBar from './MeterBar.vue'
import { api } from '../../shared/api'
import { setFlash } from '../../shared/flash'
import type { SessionAction, SessionLog, SessionPayload, SessionView } from '../../shared/types'

const route = useRoute()
const data = ref<SessionPayload | null>(null)
const events = ref<SessionLog[]>([])
const err = ref('')
const busy = ref(false)
const streamEl = ref<HTMLElement | null>(null)

const view = computed<SessionView | undefined>(() => data.value?.view)

/** 操作按用途分组；空组不显示。 */
const GROUPS: Array<{ key: string; title: string; kinds: string[] }> = [
  { key: 'scene', title: '勘查与判断', kinds: ['check', 'choice'] },
  { key: 'combat', title: '处置手段', kinds: ['attack', 'talisman', 'summon', 'ward', 'env', 'flee'] },
  { key: 'prep', title: '临场准备', kinds: ['draw'] }
]

const grouped = computed<Array<{ key: string; title: string; kinds: string[]; items: SessionAction[] }>>(() => {
  const actions = view.value?.actions || []
  return GROUPS
    .map(g => ({ ...g, items: actions.filter(a => g.kinds.includes(a.kind)) }))
    .filter(g => g.items.length)
})

async function load(): Promise<void> {
  try {
    const out = await api.session(String(route.params.id || ''))
    data.value = out
    events.value = out.logs || []
    await scroll()
  } catch (e) {
    err.value = (e as Error).message
  }
}

/** 执行一个操作：把返回的新状态并回本地，事件追加到流里。 */
async function act(actionId: string): Promise<void> {
  if (busy.value || !data.value) return
  busy.value = true
  try {
    const out = await api.act(String(route.params.id || ''), actionId)
    events.value = events.value.concat(out.events || [])
    data.value = { ...data.value, status: out.status, view: out.view }
    await scroll()
  } catch (e) {
    setFlash('操作失败：' + (e as Error).message, 'err')
  } finally {
    busy.value = false
  }
}

/** 事件流滚到底：新事件总在最下面。 */
async function scroll(): Promise<void> {
  await nextTick()
  const el = streamEl.value
  if (el) el.scrollTop = el.scrollHeight
}

onMounted(load)
</script>

<template>
  <div v-if="err" class="panel"><div class="empty">加载失败：{{ err }}</div></div>
  <div v-else-if="!data" class="loading">LOADING / 正在接入处置会话…</div>

  <template v-else>
    <template v-if="view">
    <div class="page-head">
      <div>
        <h1>{{ data.scenario.name }}</h1>
        <div class="sub">
          {{ data.code }} · 手册 {{ data.scenario.code }} ·
          节点 {{ data.character.name }}（{{ data.character.code }}）
        </div>
      </div>
      <div class="tag-list">
        <router-link class="btn" :to="`/characters/${data.character.id}`">节点详情</router-link>
        <router-link class="btn ghost" to="/">返回总览</router-link>
      </div>
    </div>

    <div class="grid" style="grid-template-columns: minmax(0, 1.75fr) minmax(0, 1fr)">
      <div>
        <div class="scene">
          <div class="head">
            <div class="place">{{ view.scene.place }} · 阶段 {{ view.scene.index + 1 }}/{{ view.scene.total }}</div>
            <div class="name">{{ view.scene.name }}</div>
          </div>
          <div class="body"><p>{{ view.scene.text }}</p></div>
        </div>

        <div class="panel" style="margin-top:14px">
          <div class="panel-head">
            <h2>可用操作</h2>
            <span class="sub">第 {{ view.turn }} 轮</span>
          </div>
          <div v-for="g in grouped" :key="g.key" style="margin-bottom:12px">
            <h3 style="margin-bottom:6px">{{ g.title }}</h3>
            <div class="actions" :class="{ 'draw-grid': g.key === 'prep' }">
              <button
                v-for="a in g.items"
                :key="a.id"
                class="act"
                :disabled="!a.enabled || busy || view.status !== 'active'"
                @click="act(a.id)"
              >
                <span class="l"><span class="k">{{ a.kind }}</span>{{ a.label }}</span>
                <span class="hint">{{ a.hint }}</span>
              </button>
            </div>
          </div>
          <div v-if="!grouped.length" class="empty">没有可执行的操作。这一局已经结束了。</div>
        </div>

        <div class="panel" style="margin-top:14px">
          <div class="panel-head">
            <h2>事件流</h2>
            <span class="sub">scheduler · 每轮由调度器掷一次</span>
          </div>
          <div ref="streamEl" style="max-height:520px;overflow-y:auto">
            <EventStream :events="events" />
          </div>
        </div>
      </div>

      <div>
        <div v-if="view.ending" class="panel" style="margin-bottom:14px">
          <div class="panel-head">
            <h2>结案报告</h2>
            <span class="sub">{{ { good: '善了', neutral: '了结', bad: '未了' }[view.ending.grade] }}</span>
          </div>
          <div class="lede">{{ view.ending.text }}</div>
          <div class="sub" style="margin-top:8px">{{ view.ending.reason }}</div>
          <div class="sub" style="margin-top:4px">记功德 +{{ view.ending.merit_award }}</div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <h2>运行指标</h2>
            <span class="sub">
              <span v-if="view.status === 'active'" class="chip accent">处置中</span>
              <span v-else class="chip">已结案</span>
            </span>
          </div>
          <div class="bars">
            <MeterBar label="气血" kind="hp" :value="view.bars.hp.value" :max="view.bars.hp.max" />
            <MeterBar label="灵力" kind="mp" :value="view.bars.mp.value" :max="view.bars.mp.max" />
            <MeterBar label="理智" kind="san" :value="view.bars.san.value" :max="view.bars.san.max" />
            <MeterBar label="阴浊" kind="corruption" :value="view.bars.corruption.value" :max="view.bars.corruption.max" />
          </div>
        </div>

        <div v-if="view.enemy" class="panel" style="margin-top:14px">
          <div class="panel-head"><h2>当前故障源</h2><span class="sub">entity</span></div>
          <div class="enemy">
            <div class="top">
              <div class="nm">{{ view.enemy.name }}</div>
              <div class="st">{{ view.enemy.element }} · {{ view.enemy.state }}态</div>
            </div>
            <div class="bar hp">
              <i :style="{ width: Math.max(0, Math.min(100, view.enemy.hp * 100 / view.enemy.max_hp)).toFixed(1) + '%' }"></i>
            </div>
            <div class="sub" style="margin-top:6px">
              {{ view.enemy.hp }} / {{ view.enemy.max_hp }} · {{ view.enemy.phase_label }}
            </div>
            <div class="wk">弱点：{{ (view.enemy.weakness || []).join(' / ') }}</div>
            <div class="lore">{{ view.enemy.lore }}</div>
          </div>
        </div>

        <div class="panel" style="margin-top:14px">
          <div class="panel-head"><h2>线索与随行</h2><span class="sub">context</span></div>
          <h3>已得线索</h3>
          <div class="tag-list">
            <span v-for="c in view.clues" :key="c" class="chip accent">{{ c }}</span>
            <span v-if="!view.clues.length" class="sub">暂无。</span>
          </div>
          <div class="hr"></div>
          <h3>随身符箓</h3>
          <div class="tag-list">
            <span v-for="(n, id) in view.inventory" :key="id" class="chip violet">{{ id }} ×{{ n }}</span>
            <span v-if="!Object.keys(view.inventory).length" class="sub">空。</span>
          </div>
          <div class="hr"></div>
          <h3>因果</h3>
          <div class="tag-list">
            <span v-for="(k, i) in view.karma" :key="i" class="chip warn">{{ k.karma }}</span>
            <span v-if="!view.karma.length" class="sub">未结。</span>
          </div>
        </div>
      </div>
    </div>
    </template>
  </template>
</template>
