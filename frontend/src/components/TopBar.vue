<script setup>
/**
 * 顶栏：书名 + 遮掩按钮 + 设置。
 *
 * 「遮掩」按钮走 stealth.js 的 cover()，快捷键 Ctrl+Shift+H 同样生效。
 */
import { useRoute } from 'vue-router'
import { computed } from 'vue'
import { cover } from '../stealth'

const emit = defineEmits(['settings'])
const route = useRoute()

const title = computed(() => route.meta.title || '玄门诡事录')
const subtitle = computed(() => route.meta.subtitle || 'XUANWU OPS')
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
