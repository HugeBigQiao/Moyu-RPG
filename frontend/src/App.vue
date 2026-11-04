<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import SideNav from './components/SideNav.vue'
import TopBar from './components/TopBar.vue'
import { flash } from './flash'

const route = useRoute()
const crumb = computed(() => route.meta.crumb || '总览 / dashboard')
</script>

<template>
  <SideNav :active="route.meta.nav" />
  <main>
    <TopBar :crumb="crumb" />
    <section class="content">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </section>
  </main>

  <transition name="fade">
    <div v-if="flash.msg" class="toast" :class="flash.level">{{ flash.msg }}</div>
  </transition>
</template>
