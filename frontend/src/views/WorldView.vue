<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'

const data = ref(null)
const err = ref('')
const tab = ref('cities')

const TABS = [
  { key: 'cities', label: '城市' },
  { key: 'nations', label: '国家' },
  { key: 'sects', label: '教派' },
  { key: 'agencies', label: '机构' },
  { key: 'figures', label: '人物' },
  { key: 'industries', label: '行业' }
]

onMounted(async () => {
  try {
    data.value = await api.world()
  } catch (e) {
    err.value = e.message
  }
})

const citiesByTier = computed(() => {
  const out = []
  if (!data.value) return out
  for (const tier of data.value.tiers) {
    const list = data.value.cities.filter(c => c.tier === tier.key)
    if (list.length) out.push({ tier, list })
  }
  return out
})

const sectNames = computed(() => {
  const map = {}
  for (const s of data.value?.sects || []) map[s.id] = s.name
  return map
})
</script>

<template>
  <div v-if="err" class="panel"><div class="empty">加载失败：{{ err }}</div></div>
  <div v-else-if="!data" class="loading">LOADING / 正在读取世界档案…</div>

  <template v-else>
    <div class="page-head">
      <div>
        <h1>世界档案</h1>
        <div class="sub">world · 国家 / 教派 / 机构 / 人物 / 行业 / 城市分级</div>
      </div>
    </div>

    <div class="tabs">
      <button v-for="t in TABS" :key="t.key" :class="{ on: tab === t.key }" @click="tab = t.key">
        {{ t.label }}
      </button>
    </div>

    <div v-if="tab === 'cities'">
      <div v-for="group in citiesByTier" :key="group.tier.key" class="panel">
        <div class="panel-head">
          <h2>{{ group.tier.name }}城市</h2>
          <span class="sub">{{ group.tier.pop }} · 事件上限 {{ group.tier.max_events }} 条</span>
        </div>
        <div class="lede" style="margin-bottom:12px">{{ group.tier.blurb }}</div>
        <table>
          <thead><tr><th>城市</th><th>所属</th><th>人口</th><th>行业</th><th>地标</th><th>事件上限</th></tr></thead>
          <tbody>
            <tr v-for="c in group.list" :key="c.id">
              <td>
                {{ c.name }}
                <div class="sub">{{ c.blurb }}</div>
              </td>
              <td class="mono dim">{{ c.nation_name }}</td>
              <td class="mono">{{ c.pop }} 万</td>
              <td class="dim">{{ c.industry_names.join(' / ') }}</td>
              <td class="dim">{{ c.landmarks.join(' · ') }}</td>
              <td class="mono">{{ c.max_events }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="tab === 'nations'" class="grid c2">
      <div v-for="n in data.nations" :key="n.id" class="panel">
        <div class="panel-head"><h2>{{ n.name }}</h2><span class="sub">{{ n.era }}</span></div>
        <div class="sub" style="margin-bottom:8px">{{ n.gov }}</div>
        <div class="lede">{{ n.blurb }}</div>
        <div class="hr"></div>
        <div class="sub">立场：{{ n.stance }}</div>
      </div>
    </div>

    <div v-if="tab === 'sects'" class="grid c2">
      <div v-for="s in data.sects" :key="s.id" class="panel">
        <div class="panel-head"><h2>{{ s.name }}</h2><span class="sub">{{ s.tradition }}</span></div>
        <div class="lede">{{ s.blurb }}</div>
        <div class="hr"></div>
        <div class="kv-grid">
          <span class="k">宗旨</span><span class="v">{{ s.doctrine }}</span>
          <span class="k">资源</span><span class="v">{{ s.resource }}</span>
        </div>
        <div class="tag-list" style="margin-top:10px">
          <span v-for="(rel, k) in s.relations" :key="k" class="chip">{{ sectNames[k] || k }}：{{ rel }}</span>
        </div>
      </div>
    </div>

    <div v-if="tab === 'agencies'" class="grid c2">
      <div v-for="a in data.agencies" :key="a.id" class="panel">
        <div class="panel-head"><h2>{{ a.name }}</h2><span class="sub">{{ a.mandate }}</span></div>
        <div class="lede">{{ a.blurb }}</div>
        <div class="hr"></div>
        <div class="kv-grid">
          <span class="k">职权</span><span class="v">{{ a.authority }}</span>
          <span class="k">关系</span><span class="v">{{ a.relation }}</span>
        </div>
      </div>
    </div>

    <div v-if="tab === 'figures'" class="grid c2">
      <div v-for="f in data.figures" :key="f.id" class="panel">
        <div class="panel-head"><h2>{{ f.name }}</h2><span class="sub">{{ f.title }}</span></div>
        <div class="lede">{{ f.blurb }}</div>
        <div class="hr"></div>
        <div class="tag-list">
          <span class="chip accent">{{ f.org }}</span>
          <span class="chip">{{ f.element }}</span>
        </div>
        <div class="sub" style="margin-top:8px">钩子：{{ f.hook }}</div>
      </div>
    </div>

    <div v-if="tab === 'industries'" class="panel">
      <div class="panel-head"><h2>行业</h2><span class="sub">{{ data.industries.length }} 个</span></div>
      <table>
        <thead><tr><th>行业</th><th>规模</th><th>涉祟风险</th><th>说明</th></tr></thead>
        <tbody>
          <tr v-for="i in data.industries" :key="i.id">
            <td>{{ i.name }}</td>
            <td class="mono">{{ '■'.repeat(i.scale) }}</td>
            <td class="mono">{{ '■'.repeat(i.risk) }}</td>
            <td class="dim">{{ i.blurb }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
</template>
