<script setup lang="ts">
/**
 * 应用外壳。
 *
 * 职责：
 *     挂顶栏、路由出口、设置面板、遮掩层与全局 toast；启动时初始化设置与遮掩监听。
 * 为什么需要：
 *     这些是全站共享的界面元素，不属于任何一个路由页面；放在这里只装配、不放业务。
 * 上下游：
 *     上游：main.ts 挂载；shared/settings.ts、shared/stealth.ts、shared/flash.ts；
 *     下游：app/TopBar.vue、app/SettingsPanel.vue、app/StealthOverlay.vue。
 */
import { onMounted, onUnmounted, ref } from 'vue'

import SettingsPanel from './SettingsPanel.vue'
import StealthOverlay from './StealthOverlay.vue'
import TopBar from './TopBar.vue'
import { flash } from '../shared/flash'
import { initSettings } from '../shared/settings'
import { installStealth, stealth, uninstallStealth } from '../shared/stealth'

const showSettings = ref(false)

onMounted(() => {
  initSettings()
  installStealth()
})

onUnmounted(uninstallStealth)
</script>

<template>
  <TopBar @settings="showSettings = true" />

  <router-view v-slot="{ Component }">
    <transition name="fade" mode="out-in">
      <component :is="Component" />
    </transition>
  </router-view>

  <SettingsPanel v-if="showSettings" @close="showSettings = false" />

  <StealthOverlay v-if="stealth.covered" />

  <transition name="fade">
    <div v-if="flash.msg" class="toast" :class="flash.level">{{ flash.msg }}</div>
  </transition>
</template>
