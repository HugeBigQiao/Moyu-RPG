<script setup>
import { onMounted, ref } from 'vue'
import { api } from '../api'

const data = ref(null)
const world = ref(null)
const samples = ref([])
const city = ref('nanyu')
const err = ref('')
const busy = ref(false)

async function loadSamples() {
  busy.value = true
  try {
    const out = await api.randomMissions(city.value, 4)
    samples.value = out.samples
  } catch (e) {
    err.value = e.message
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  try {
    const [m, w] = await Promise.all([api.missions(), api.world()])
    data.value = m
    world.value = w
    await loadSamples()
  } catch (e) {
    err.value = e.message
  }
})
</script>

<template>
  <div v-if="err" class="panel"><div class="empty">加载失败：{{ err }}</div></div>
  <div v-else-if="!data" class="loading">LOADING / 正在读取任务库…</div>

  <template v-else>
    <div class="page-head">
      <div>
        <h1>任务库</h1>
        <div class="sub">
          missions · 固定案子 {{ data.missions.length }} 个 + 由「城市 × 事件」现场拼的随机任务
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><h2>固定任务</h2><span class="sub">按城市绑定</span></div>
      <table>
        <thead><tr><th>任务</th><th>等级</th><th>可发案城市</th><th>简介</th></tr></thead>
        <tbody>
          <tr v-for="m in data.missions" :key="m.id">
            <td><b>{{ m.name }}</b><div class="sub mono">{{ m.id }}</div></td>
            <td class="mono">{{ m.tier }}</td>
            <td class="dim">{{ m.city_names.join(' / ') }}</td>
            <td class="dim">{{ m.blurb }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="panel-head">
        <h2>随机任务</h2>
        <span class="sub">city × events → scenes</span>
      </div>
      <div class="lede" style="margin-bottom:12px">
        选城市，系统按「城市行业 + 事件池」现场拼一场：几条勘查、一只祟物、一处分歧。
        任务编号里带着种子，重进能复现同一场；难度与报酬由事件等级和祟物体量算出来。
      </div>
      <div class="tag-list" style="margin-bottom:14px">
        <select v-model="city" @change="loadSamples"
                style="padding:6px 10px;background:#0e141b;border:1px solid var(--line-2);border-radius:6px;color:var(--fg)">
          <option v-for="c in world.cities" :key="c.id" :value="c.id">
            {{ c.name }}（{{ c.tier_name }}）
          </option>
        </select>
        <button :class="{ spin: busy }" :disabled="busy" @click="loadSamples">再生成一批</button>
      </div>

      <div class="grid c2">
        <div v-for="s in samples" :key="s.id" class="panel" style="background:#0e141b">
          <div class="panel-head">
            <h2>{{ s.name }}</h2>
            <span class="sub mono">{{ s.code }}</span>
          </div>
          <div class="kv-grid">
            <span class="k">城市</span><span class="v">{{ s.city_name }}</span>
            <span class="k">难度</span><span class="v">{{ s.difficulty }}（{{ s.grade }}）</span>
            <span class="k">报酬</span><span class="v">{{ s.reward }} 功德</span>
            <span class="k">阶段</span><span class="v">{{ s.scenes }}</span>
          </div>
          <div class="hr"></div>
          <div class="sub">出身事件</div>
          <div class="tag-list" style="margin-top:6px">
            <span v-for="n in s.event_names" :key="n" class="chip accent">{{ n }}</span>
          </div>
          <div class="sub" style="margin-top:10px">祟物：{{ s.monster.name }}（{{ s.monster.hp }} 气血）</div>
          <div class="sub" style="margin-top:6px">到「人员档案」里选一个人，点「随机任务」就能开这一场。</div>
        </div>
      </div>
    </div>
  </template>
</template>
