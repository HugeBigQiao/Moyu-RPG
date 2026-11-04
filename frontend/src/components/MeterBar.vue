<script setup>
import { computed } from 'vue'

const props = defineProps({
  label: { type: String, required: true },
  value: { type: Number, required: true },
  max: { type: Number, required: true },
  kind: { type: String, default: '' }
})

const pct = computed(() => {
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
