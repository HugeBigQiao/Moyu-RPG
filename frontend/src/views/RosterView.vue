<script setup>
import { onMounted, ref } from 'vue'
import { api } from '../api'
import { setFlash } from '../flash'

const data = ref(null)
const world = ref(null)
const err = ref('')
const busy = ref(false)
const city = ref('')

async function load() {
  try {
    const [roster, w] = await Promise.all([api.roster(), api.world()])
    data.value = roster
    world.value = w
  } catch (e) {
    err.value = e.message
  }
}

async function generate(count) {
  busy.value = true
  try {
    const out = await api.npcs(count, city.value || null)
    const names = out.people.map(p => `${p.name}（${p.city_name}·难度${p.difficulty}）`).join('、')
    setFlash(`生成 ${out.created} 人：${names}`)
    await load()
  } catch (e) {
    setFlash('生成失败：' + e.message, 'err')
  } finally {
    busy.value = false
  }
}

async function remove(ch) {
  if (!confirm(`注销 ${ch.code}（${ch.name}）？相关记录会一起删掉。`)) return
  try {
    await api.remove(ch.id)
    setFlash(`已注销 ${ch.code}`)
    await load()
  } catch (e) {
    setFlash('注销失败：' + e.message, 'err')
  }
}

onMounted(load)
</script>

<template>
  <div v-if="err" class="panel"><div class="empty">加载失败：{{ err }}</div></div>
  <div v-else-if="!data" class="loading">LOADING / 正在读取人员档案…</div>

  <template v-else>
    <div class="page-head">
      <div>
        <h1>人员档案</h1>
        <div class="sub">personnel · 玩家自建 + 系统随机（城市决定这个人能有多复杂）</div>
      </div>
      <div class="tag-list">
        <select v-model="city"
                style="padding:6px 10px;background:#0e141b;border:1px solid var(--line-2);border-radius:6px;color:var(--fg)">
          <option value="">全部城市随机</option>
          <option v-for="c in world.cities" :key="c.id" :value="c.id">
            {{ c.name }}（{{ c.tier_name }}）
          </option>
        </select>
        <button :class="{ spin: busy }" :disabled="busy" @click="generate(1)">随机 1 人</button>
        <button :class="{ spin: busy }" :disabled="busy" @click="generate(5)">随机 5 人</button>
        <router-link class="btn primary" to="/create">新建角色</router-link>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2>在册人员</h2>
        <span class="sub">{{ data.rows.length }} 人</span>
      </div>
      <table v-if="data.rows.length">
        <thead>
          <tr><th>档案号</th><th>姓名</th><th>类型</th><th>出身</th><th>流派</th>
              <th>稀有度</th><th>箓职</th><th>事件</th><th>难度 / 报酬</th><th>功德</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="row in data.rows" :key="row.id">
            <td class="mono">{{ row.code }}</td>
            <td><router-link :to="`/characters/${row.id}`">{{ row.name }}</router-link></td>
            <td>
              <span class="chip" :class="row.kind === 'player' ? 'good' : ''">
                {{ row.kind === 'player' ? '玩家' : 'NPC' }}
              </span>
            </td>
            <td>
              {{ row.city_name }}
              <span class="sub">{{ row.city_tier }}</span>
            </td>
            <td><span class="chip">{{ row.school_name }}</span></td>
            <td><span class="chip" :class="'rarity-' + row.rarity">{{ row.rarity }}品</span></td>
            <td class="mono dim">{{ row.rank }}</td>
            <td class="mono">{{ row.events.length }}</td>
            <td class="mono">{{ row.difficulty }} / {{ row.reward }}</td>
            <td class="mono">{{ row.merit }}</td>
            <td class="row-actions">
              <router-link :to="`/characters/${row.id}`">详情</router-link>
              <button class="ghost danger" style="padding:2px 8px;font-size:11px" @click="remove(row)">注销</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">档案是空的。点右上角「随机 1 人」或「新建角色」。</div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="panel-head"><h2>城市与事件容量</h2><span class="sub">tier → max events</span></div>
      <table>
        <thead><tr><th>等级</th><th>人口</th><th>单人最多带多少事件</th><th>说明</th></tr></thead>
        <tbody>
          <tr v-for="t in world.tiers" :key="t.key">
            <td><span class="chip accent">{{ t.name }}</span></td>
            <td class="mono">{{ t.pop }}</td>
            <td class="mono">{{ t.max_events }}</td>
            <td class="dim">{{ t.blurb }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
</template>
