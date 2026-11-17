<script setup lang="ts">
/**
 * 一条指标条（气血 / 灵力 / 理智 / 阴浊）。
 *
 * 职责：
 *     按 value / max 算百分比并画成一条，颜色由 kind 决定。
 * 为什么需要：
 *     角色页与处置台都要用；放在一处，四类条的样式与取整规则不会各写一遍。
 * 上下游：
 *     上游：areas/play/CharacterView.vue、areas/play/PlayView.vue；
 *     下游：无，纯展示。
 */
import { computed } from 'vue'

const props = defineProps<{
  label: string
  value: number
  max: number
  /** 对应 CSS 里的 .bar.hp / .mp / .san / .corruption */
  kind?: string
}>()

/** 百分比：夹在 0–100，max 为 0 时按 0 处理，避免除零。 */
const pct = computed<number>(() => {
  if (!props.max) return 0
  return Math.max(0, Math.min(100, (props.value / props.max) * 100))
})
</script>

<template>
  <div class="row">
    <span class="name">{{ label }}</span>
    <span class="bar" :class="kind"><i :style="{ width: pct.toFixed(1) + '%' }"></i></span>
    <span class="num">{{ value }}/{{ max }}</span>
  </div>
</template>
