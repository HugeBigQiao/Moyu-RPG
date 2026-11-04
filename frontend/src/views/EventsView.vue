<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'

const data = ref(null)
const err = ref('')
const gradeFilter = ref(0)

onMounted(async () => {
  try {
    data.value = await api.events()
  } catch (e) {
    err.value = e.message
  }
})

const groups = computed(() => {
  if (!data.value) return []
  const out = []
  for (const grade of [1, 2, 3, 4]) {
    const list = data.value.events.filter(e => e.grade === grade)
    if (list.length && (!gradeFilter.value || gradeFilter.value === grade)) {
      out.push({ grade, info: data.value.grades[grade], list })
    }
  }
  return out
})

const SCOPE = { general: '通用', mission: '限定任务', city: '限定城市' }
</script>

<template>
  <div v-if="err" class="panel"><div class="empty">加载失败：{{ err }}</div></div>
  <div v-else-if="!data" class="loading">LOADING / 正在读取事件库…</div>

  <template v-else>
    <div class="page-head">
      <div>
        <h1>事件库</h1>
        <div class="sub">
          events · 共 {{ data.events.length }} 条 · 等级越高越稀罕，也越少被通用
        </div>
      </div>
    </div>

    <div class="tabs">
      <button :class="{ on: gradeFilter === 0 }" @click="gradeFilter = 0">全部</button>
      <button v-for="g in [1, 2, 3, 4]" :key="g" :class="{ on: gradeFilter === g }" @click="gradeFilter = g">
        {{ data.grades[g].name }}
      </button>
    </div>

    <div v-for="group in groups" :key="group.grade" class="panel">
      <div class="panel-head">
        <h2>{{ group.info.name }}事件</h2>
        <span class="sub">{{ group.list.length }} 条 · {{ group.info.weight_scale }}× 权重</span>
      </div>
      <table>
        <thead><tr><th>事件</th><th>适用范围</th><th>关联任务</th><th>赋予特性</th></tr></thead>
        <tbody>
          <tr v-for="e in group.list" :key="e.id">
            <td style="max-width:520px">
              <b>{{ e.name }}</b>
              <div class="dim" style="margin-top:3px">{{ e.text }}</div>
              <div class="sub" style="margin-top:3px">钩子：{{ e.hook }}</div>
            </td>
            <td>
              <span class="chip" :class="e.scope === 'general' ? '' : 'accent'">{{ SCOPE[e.scope] || e.scope }}</span>
              <div v-if="e.industries && e.industries.length" class="sub" style="margin-top:4px">
                {{ e.industries.join(' / ') }}
              </div>
            </td>
            <td class="mono dim">{{ (e.missions || []).join(', ') || '—' }}</td>
            <td>
              <span v-for="t in e.trait_names" :key="t.name" class="chip violet" style="margin-right:4px">
                {{ t.name }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
</template>
