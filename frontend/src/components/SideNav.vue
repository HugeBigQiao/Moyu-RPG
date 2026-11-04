<script setup>
defineProps({ active: { type: String, default: 'dashboard' } })

const items = [
  { key: 'dashboard', to: '/', ico: '01', label: '总览' },
  { key: 'roster', to: '/roster', ico: '02', label: '人员档案' },
  { key: 'world', to: '/world', ico: '03', label: '世界档案' },
  { key: 'events', to: '/events', ico: '04', label: '事件库' },
  { key: 'missions', to: '/missions', ico: '05', label: '任务库' },
  { key: 'scenarios', to: '/scenarios', ico: '06', label: '作业手册' }
]
</script>

<template>
  <aside class="side">
    <div class="brand">
      <div class="brand-mark">玄</div>
      <div>
        <div class="brand-name">XUANWU OPS</div>
        <div class="brand-sub">edge control plane</div>
      </div>
    </div>

    <nav>
      <router-link
        v-for="item in items"
        :key="item.key"
        :to="item.to"
        :class="{ on: active === item.key }"
      >
        <span class="ico">{{ item.ico }}</span>{{ item.label }}
      </router-link>
    </nav>

    <div class="side-foot">
      <div class="kv"><span>cluster</span><b>cn-east-1</b></div>
      <div class="kv"><span>build</span><b>v2.7.14</b></div>
      <div class="kv"><span>sla</span><b>99.97%</b></div>
      <div class="kv"><span>on-call</span><b>夜班</b></div>
    </div>
  </aside>
</template>
