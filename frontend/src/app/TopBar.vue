<script setup lang="ts">
/**
 * 顶栏：书名 / 当前页标题 + 遮掩按钮 + 设置入口。
 *
 * 职责：
 *     显示路由 meta 里的标题，提供「一键遮掩」与「打开设置」两个动作。
 * 为什么需要：
 *     遮掩是工位场景的第一入口，必须全站可达；标题也统一由路由决定，页面不用各写一遍。
 * 上下游：
 *     上游：app/router.ts 的 meta、app/App.vue 传下来的 settings 事件；
 *     下游：shared/stealth.ts 的 cover()、App.vue 的设置面板开关。
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import { cover } from '../shared/stealth'

const emit = defineEmits<{ (e: 'settings'): void }>()
const route = useRoute()

const title = computed(() => String(route.meta.title || '玄门诡事录'))
const subtitle = computed(() => String(route.meta.subtitle || 'XUANWU OPS'))
</script>

<template>
  <header class="topbar">
    <div class="tb-left">
      <router-link to="/" class="tb-brand">
        <span class="tb-mark">玄</span>
        <span class="tb-text">
          <b>{{ title }}</b>
          <em>{{ subtitle }}</em>
        </span>
      </router-link>
    </div>
    <div class="tb-right">
      <span class="tb-status"><i class="dot ok"></i>本地运行</span>
      <button class="tb-gear" title="一键遮掩（Ctrl+Shift+H）" @click="cover">◐ 遮掩</button>
      <button class="tb-gear" title="设置" @click="emit('settings')">⚙ 设置</button>
    </div>
  </header>
</template>
