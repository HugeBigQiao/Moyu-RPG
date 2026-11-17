<script setup lang="ts">
/**
 * 事件流：把一局里发生的事按顺序列出来。
 *
 * 职责：
 *     把事件 kind 缩成几个字母的标签，severity 映射成颜色（沿用 .ev.good/.warn/.error）。
 * 为什么需要：
 *     处置台的重点是「刚才发生了什么」；统一在这里排版，页面只负责往里塞事件。
 * 上下游：
 *     上游：areas/play/PlayView.vue 的 events；
 *     下游：无，纯展示。
 */
import type { SessionLog } from '../../shared/types'

withDefaults(defineProps<{ events?: SessionLog[] }>(), { events: () => [] })

/** kind → 短标签；没列到的直接用原 kind，方便后端加新事件类型。 */
const LABEL: Record<string, string> = {
  check: 'check', attack: 'hit', damage: 'dmg', hurt: 'hurt',
  kp: 'KP', scene: 'stage', encounter: 'alert', clear: 'clear',
  talisman: 'talis', reveal: 'reveal', ending: 'close', story: 'narr',
  clue: 'clue', corruption: 'load', san: 'san', heal: 'heal',
  ward: 'ward', summon: 'summon', choice: 'karma', karma: 'karma',
  draw: 'draw', flee: 'flee', note: 'note', env: 'env', down: 'down',
  control: 'ctrl', calm: 'calm', merit: 'merit'
}
</script>

<template>
  <div class="stream">
    <div
      v-for="(ev, i) in events"
      :key="i"
      class="ev"
      :class="[ev.severity || 'info', ev.kind === 'kp' ? 'kp' : '', ev.kind === 'ending' ? 'ending' : '']"
    >
      <div class="tag">{{ LABEL[ev.kind] || ev.kind }}</div>
      <div class="txt">{{ ev.text }}</div>
    </div>
    <div v-if="!events.length" class="empty">还没有事件。</div>
  </div>
</template>
