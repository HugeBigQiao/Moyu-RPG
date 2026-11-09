<script setup>
import { onMounted, ref } from 'vue'
import TopBar from './components/TopBar.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import { flash } from './flash'
import { initSettings } from './settings'

const showSettings = ref(false)
onMounted(initSettings)
</script>

<template>
  <TopBar @settings="showSettings = true" />

  <router-view v-slot="{ Component }">
    <transition name="fade" mode="out-in">
      <component :is="Component" />
    </transition>
  </router-view>

  <SettingsPanel v-if="showSettings" @close="showSettings = false" />

  <transition name="fade">
    <div v-if="flash.msg" class="toast" :class="flash.level">{{ flash.msg }}</div>
  </transition>
</template>
