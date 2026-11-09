<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import TopBar from './components/TopBar.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import StealthOverlay from './components/StealthOverlay.vue'
import { flash } from './flash'
import { initSettings } from './settings'
import { installStealth, stealth, uninstallStealth } from './stealth'

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
