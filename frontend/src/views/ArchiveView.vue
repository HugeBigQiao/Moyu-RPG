<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'

const route = useRoute()
const router = useRouter()

const KINDS = [
  { key: 'cities', name: '城市设定', group: 'world', pick: d => d.cities },
  { key: 'figures', name: '人物设定', group: 'world', pick: d => d.figures },
  { key: 'agencies', name: '国家机构', group: 'world', pick: d => d.agencies },
  { key: 'sects', name: '教派', group: 'world', pick: d => d.sects },
  { key: 'industries', name: '行业', group: 'world', pick: d => d.industries },
  { key: 'nations', name: '国家', group: 'world', pick: d => d.nations },
  { key: 'lore', name: '世界背景', group: 'world', pick: d => d.lore },
  { key: 'events', name: '事件库', group: 'events', pick: d => d.events },
  { key: 'missions', name: '任务库', group: 'missions', pick: d => d.missions },
  { key: 'equipment', name: '装备库', group: 'equipment', pick: d => d.equipment },
  { key: 'traits', name: '人物特性库', group: 'traits', pick: d => d.traits }
]

const cache = ref({})
const loading = ref(false)
const err = ref('')
const selected = ref(0)

const kind = computed(() => KINDS.find(k => k.key === (route.params.kind || 'cities')) || KINDS[0])
const items = computed(() => {
  const k = kind.value
  const data = cache.value[k.group] || cache.value[k.key]
  if (!data) return []
  return k.pick(data).map(raw => ({
    raw,
    id: raw.id || raw.name || raw.title,
    title: raw.name || raw.title,
    sub: subtitle(raw)
  }))
})
const current = computed(() => items.value[selected.value] || null)

function subtitle(raw) {
  if (raw.tier_name) return `${raw.tier_name} · ${raw.nation_name || ''}`
  if (raw.grade_name) return raw.grade_name
  if (raw.tier) return `第 ${raw.tier} 级`
  if (raw.kind) return raw.kind
  if (raw.rank) return `${raw.rank}箓`
  if (raw.tradition) return raw.tradition
  if (raw.mandate) return raw.mandate
  if (raw.title) return raw.title
  if (raw.scale) return `规模 ${raw.scale} · 风险 ${raw.risk}`
  if (raw.gov) return raw.gov
  return ''
}

const loaded = new Set()

async function load(k) {
  if (loaded.has(k.key)) return
  loading.value = true
  err.value = ''
  try {
    if (k.group === 'world') {
      cache.value.world = cache.value.world || await api.world()
    } else if (k.group === 'events') {
      cache.value.events = await api.events()
    } else if (k.group === 'missions') {
      cache.value.missions = await api.missions()
    } else if (k.group === 'equipment') {
      cache.value.equipment = await api.equipment()
    } else if (k.group === 'traits') {
      cache.value.traits = await api.traits()
    }
    loaded.add(k.key)
  } catch (e) {
    err.value = e.message
  } finally {
    loading.value = false
  }
}

function go(key) {
  router.push(`/archive/${key}`)
}

onMounted(() => load(kind.value))
watch(() => route.params.kind, () => {
  selected.value = 0
  load(kind.value)
})
</script>

<template>
  <div class="page">
    <div class="archive">
      <aside class="arch-nav">
        <h3>背景档案</h3>
        <a
          v-for="k in KINDS"
          :key="k.key"
          href="javascript:void(0)"
          :class="{ on: kind.key === k.key }"
          @click="go(k.key)"
        >
          {{ k.name }}
          <span class="n" v-if="cache[k.group] || cache[k.key]">
            {{ (cache[k.group] || cache[k.key]) ? k.pick(cache[k.group] || cache[k.key]).length : '' }}
          </span>
        </a>
      </aside>

      <section class="arch-body">
        <div class="page-head" style="margin-bottom:12px">
          <div>
            <h1 style="font-size:18px">{{ kind.name }}</h1>
            <div class="sub">{{ items.length }} 条 · 左侧选择，右侧看详情</div>
          </div>
        </div>

        <div v-if="err" class="panel"><div class="empty">加载失败：{{ err }}</div></div>
        <div v-else-if="loading && !items.length" class="loading">LOADING / 正在读取档案…</div>

        <div v-else class="grid" style="grid-template-columns: 240px minmax(0, 1fr); gap: 14px; align-items: start">
          <div class="arch-list">
            <button
              v-for="(item, i) in items"
              :key="item.id"
              class="arch-item"
              :class="{ on: selected === i }"
              @click="selected = i"
            >
              <div class="t">{{ item.title }}</div>
              <div class="s">{{ item.sub }}</div>
            </button>
          </div>

          <div class="arch-detail">
            <div v-if="current" class="panel">
              <template v-if="kind.key === 'cities'">
                <div class="panel-head">
                  <h2>{{ current.raw.name }}</h2>
                  <span class="sub">{{ current.raw.tier_name }} · {{ current.raw.nation_name }} · {{ current.raw.pop }} 万</span>
                </div>
                <div class="lede">{{ current.raw.blurb }}</div>
                <div class="hr"></div>
                <div class="kv-grid">
                  <span class="k">事件上限</span><span class="v">{{ current.raw.max_events }} 条</span>
                  <span class="k">坐标</span><span class="v">{{ current.raw.lat.toFixed(2) }}, {{ current.raw.lon.toFixed(2) }}</span>
                </div>
                <div class="hr"></div>
                <h3>行业</h3>
                <div class="tag-list">
                  <span v-for="n in current.raw.industry_names" :key="n" class="chip">{{ n }}</span>
                </div>
                <h3 style="margin-top:14px">地标</h3>
                <div class="tag-list">
                  <span v-for="n in current.raw.landmarks" :key="n" class="chip accent">{{ n }}</span>
                </div>
                <h3 style="margin-top:14px">当前势力</h3>
                <div v-for="f in current.raw.factions" :key="f.name" class="ev" style="margin-bottom:6px">
                  <div class="tag">{{ f.kind }}</div>
                  <div class="txt"><b>{{ f.name }}</b> —— {{ f.note }}</div>
                </div>
              </template>

              <template v-else-if="kind.key === 'figures'">
                <div class="panel-head">
                  <h2>{{ current.raw.name }}</h2>
                  <span class="sub">{{ current.raw.title }}</span>
                </div>
                <div class="lede">{{ current.raw.blurb }}</div>
                <div class="hr"></div>
                <div class="tag-list">
                  <span class="chip accent">{{ current.raw.org }}</span>
                  <span class="chip">本命 {{ current.raw.element }}</span>
                </div>
                <h3 style="margin-top:14px">钩子</h3>
                <div class="lede">{{ current.raw.hook }}</div>
              </template>

              <template v-else-if="kind.key === 'agencies'">
                <div class="panel-head">
                  <h2>{{ current.raw.name }}</h2>
                  <span class="sub">{{ current.raw.mandate }}</span>
                </div>
                <div class="lede">{{ current.raw.blurb }}</div>
                <div class="hr"></div>
                <div class="kv-grid">
                  <span class="k">职权</span><span class="v">{{ current.raw.authority }}</span>
                  <span class="k">关系</span><span class="v">{{ current.raw.relation }}</span>
                </div>
              </template>

              <template v-else-if="kind.key === 'sects'">
                <div class="panel-head">
                  <h2>{{ current.raw.name }}</h2>
                  <span class="sub">{{ current.raw.tradition }}</span>
                </div>
                <div class="lede">{{ current.raw.blurb }}</div>
                <div class="hr"></div>
                <div class="kv-grid">
                  <span class="k">宗旨</span><span class="v">{{ current.raw.doctrine }}</span>
                  <span class="k">资源</span><span class="v">{{ current.raw.resource }}</span>
                </div>
                <div class="hr"></div>
                <div class="tag-list">
                  <span v-for="(rel, k) in current.raw.relations" :key="k" class="chip">{{ k }}：{{ rel }}</span>
                </div>
              </template>

              <template v-else-if="kind.key === 'industries'">
                <div class="panel-head">
                  <h2>{{ current.raw.name }}</h2>
                  <span class="sub">规模 {{ current.raw.scale }} · 风险 {{ current.raw.risk }}</span>
                </div>
                <div class="lede">{{ current.raw.blurb }}</div>
                <div class="hr"></div>
                <div class="sub">行业是平等的，地产只是因为规模大，占的坑多。</div>
              </template>

              <template v-else-if="kind.key === 'nations'">
                <div class="panel-head">
                  <h2>{{ current.raw.name }}</h2>
                  <span class="sub">{{ current.raw.era }}</span>
                </div>
                <div class="sub" style="margin-bottom:8px">{{ current.raw.gov }}</div>
                <div class="lede">{{ current.raw.blurb }}</div>
                <div class="hr"></div>
                <div class="sub">立场：{{ current.raw.stance }}</div>
              </template>

              <template v-else-if="kind.key === 'lore'">
                <div class="panel-head">
                  <h2>{{ current.raw.title }}</h2>
                  <span class="sub">world</span>
                </div>
                <div class="lede" style="font-size:14px;line-height:2">{{ current.raw.body }}</div>
              </template>

              <template v-else-if="kind.key === 'events'">
                <div class="panel-head">
                  <h2>{{ current.raw.name }}</h2>
                  <span class="sub">{{ current.raw.grade_name }} · {{ current.raw.scope }}</span>
                </div>
                <div class="lede">{{ current.raw.text }}</div>
                <div class="hr"></div>
                <div class="sub">钩子：{{ current.raw.hook }}</div>
                <div class="hr"></div>
                <h3>赋予特性</h3>
                <div class="tag-list">
                  <span v-for="t in current.raw.trait_names" :key="t.name" class="chip violet">{{ t.name }}</span>
                </div>
                <div v-if="current.raw.missions && current.raw.missions.length" style="margin-top:12px">
                  <h3>限定任务</h3>
                  <div class="tag-list">
                    <span v-for="m in current.raw.missions" :key="m" class="chip accent">{{ m }}</span>
                  </div>
                </div>
              </template>

              <template v-else-if="kind.key === 'missions'">
                <div class="panel-head">
                  <h2>{{ current.raw.name }}</h2>
                  <span class="sub">{{ current.raw.id }} · 第 {{ current.raw.tier }} 级</span>
                </div>
                <div class="lede">{{ current.raw.blurb }}</div>
                <div class="hr"></div>
                <div class="kv-grid">
                  <span class="k">类型</span><span class="v">{{ current.raw.kind }}</span>
                  <span class="k">可发案城市</span><span class="v">{{ current.raw.city_names.join(' / ') }}</span>
                </div>
              </template>

              <template v-else-if="kind.key === 'equipment'">
                <div class="panel-head">
                  <h2>{{ current.raw.name }}</h2>
                  <span class="sub">{{ current.raw.kind }} · {{ current.raw.grade_name }}</span>
                </div>
                <div class="lede">{{ current.raw.desc }}</div>
                <div class="hr"></div>
                <div class="kv-grid">
                  <span class="k">效果</span><span class="v">{{ current.raw.effect }}</span>
                  <span class="k">功德</span><span class="v">{{ current.raw.price }}</span>
                </div>
              </template>

              <template v-else-if="kind.key === 'traits'">
                <div class="panel-head">
                  <h2>{{ current.raw.name }}</h2>
                  <span class="sub">{{ current.raw.tier_name }}</span>
                </div>
                <div class="lede">{{ current.raw.desc }}</div>
                <div class="hr"></div>
                <div class="tag-list">
                  <span v-for="(v, k) in current.raw.effect" :key="k" class="chip">
                    {{ k }} {{ v > 0 ? '+' : '' }}{{ v }}
                  </span>
                </div>
              </template>
            </div>
            <div v-else class="panel"><div class="empty">这一类还没有内容。</div></div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
