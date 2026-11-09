<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import { setFlash } from '../flash'
import ChinaMap from '../components/ChinaMap.vue'

const router = useRouter()

const cities = ref([])
const detail = ref(null)
const roster = ref([])
const mode = ref('city')      // city | people | missions | links
const busy = ref(false)
const characterId = ref(null)

const cityId = computed(() => detail.value?.city.id || '')

async function loadMap() {
  const out = await api.gameMap()
  cities.value = out.cities
  if (out.cities.length) await selectCity(out.cities[0].id)
}

async function loadRoster() {
  const out = await api.roster()
  roster.value = out.rows
  if (!characterId.value && out.rows.length) {
    const player = out.rows.find(r => r.kind === 'player')
    characterId.value = (player || out.rows[0]).id
  }
}

async function selectCity(id) {
  try {
    detail.value = await api.gameCity(id)
    mode.value = 'city'
  } catch (e) {
    setFlash('读取城市失败：' + e.message, 'err')
  }
}

async function spawn() {
  if (busy.value) return
  busy.value = true
  try {
    const out = await api.npcs(2, cityId.value || null)
    setFlash(`在${detail.value.city.name}生成 ${out.created} 人`)
    await loadRoster()
    await loadMap()
  } catch (e) {
    setFlash('生成失败：' + e.message, 'err')
  } finally {
    busy.value = false
  }
}

async function startRandom() {
  if (!characterId.value) { setFlash('先选一个人物', 'err'); return }
  busy.value = true
  try {
    const out = await api.startRandom(characterId.value, cityId.value || null)
    router.push(`/play/${out.id}`)
  } catch (e) {
    setFlash('开团失败：' + e.message, 'err')
  } finally {
    busy.value = false
  }
}

async function startFixed(mission) {
  if (!characterId.value) { setFlash('先选一个人物', 'err'); return }
  busy.value = true
  try {
    const out = await api.startSession(characterId.value, mission.id)
    router.push(`/play/${out.id}`)
  } catch (e) {
    setFlash('开团失败：' + e.message, 'err')
  } finally {
    busy.value = false
  }
}

const selected = computed(() => roster.value.find(r => r.id === characterId.value) || null)

onMounted(async () => {
  try {
    await Promise.all([loadRoster(), loadMap()])
  } catch (e) {
    setFlash('加载失败：' + e.message, 'err')
  }
})
</script>

<template>
  <div class="page">
    <div class="game-grid">
      <!-- 左：地图 -->
      <div>
        <ChinaMap :cities="cities" :selected="cityId" @select="selectCity" />
        <div class="sub" style="margin-top:8px;padding:0 4px">
          点城市看它的任务、势力与在册人物。地图按人口/等级标点，越大的城事件上限越高。
        </div>
      </div>

      <!-- 中：展示面板 -->
      <div class="panel" style="min-height:520px">
        <template v-if="mode === 'city' && detail">
          <div class="panel-head">
            <h2>{{ detail.city.name }}</h2>
            <span class="sub">{{ detail.city.tier_name }} · {{ detail.city.nation_name }} · {{ detail.city.pop }} 万</span>
          </div>
          <div class="lede">{{ detail.city.blurb }}</div>

          <div class="hr"></div>
          <div class="kv-grid">
            <span class="k">事件上限</span><span class="v">{{ detail.city.max_events }} 条</span>
            <span class="k">在册人物</span><span class="v">{{ detail.people.length }} 人</span>
            <span class="k">固定任务</span><span class="v">{{ detail.missions.length }} 桩</span>
            <span class="k">势力</span><span class="v">{{ detail.factions.length }} 方</span>
          </div>

          <div class="hr"></div>
          <h3>当前势力</h3>
          <div v-for="f in detail.factions" :key="f.name" class="ev" style="margin-bottom:6px">
            <div class="tag">{{ f.kind }}</div>
            <div class="txt"><b>{{ f.name }}</b> —— {{ f.note }}</div>
          </div>

          <div class="hr"></div>
          <h3>当前任务</h3>
          <div v-for="m in detail.missions" :key="m.id" class="menu-row" style="margin-bottom:6px">
            <span class="nm">{{ m.name }}<span class="sub"> · 第 {{ m.tier }} 级</span></span>
            <button style="padding:2px 8px;font-size:11px" @click="startFixed(m)">开团</button>
          </div>
          <div v-if="!detail.missions.length" class="sub">这座城市没有固定案子，只能开随机任务。</div>

          <div class="hr"></div>
          <h3>随机任务（现场生成）</h3>
          <div v-for="s in detail.random_missions" :key="s.id" class="menu-row" style="margin-bottom:6px">
            <span class="nm">{{ s.name }}<span class="sub"> · 难度 {{ s.difficulty }} · 报酬 {{ s.reward }}</span></span>
            <span class="sub">{{ s.grade }}</span>
          </div>

          <div class="tag-list" style="margin-top:14px">
            <button class="primary" :disabled="busy" @click="startRandom">开一桩随机任务</button>
            <button :disabled="busy" @click="spawn">在此生成人物</button>
          </div>
        </template>

        <template v-else-if="mode === 'people'">
          <div class="panel-head"><h2>人物</h2><span class="sub">{{ roster.length }} 人在册</span></div>
          <div class="tag-list" style="margin-bottom:12px">
            <button class="primary" :disabled="busy" @click="spawn">生成 {{ detail ? detail.city.name : '' }} 的人</button>
            <router-link class="btn" to="/create">新建玩家角色</router-link>
          </div>
          <div class="menu-list" style="max-height:460px">
            <div v-for="p in roster" :key="p.id" class="menu-row">
              <span class="nm">
                <b>{{ p.name }}</b>
                <span class="sub"> · {{ p.city_name }} · {{ p.rank }}箓 · 难度 {{ p.difficulty }}</span>
              </span>
              <span class="row-actions">
                <button style="padding:1px 7px;font-size:11px"
                        :class="{ primary: characterId === p.id }"
                        @click="characterId = p.id">
                  {{ characterId === p.id ? '已选' : '选' }}
                </button>
                <router-link :to="`/characters/${p.id}`" style="font-size:11px">档案</router-link>
              </span>
            </div>
          </div>
        </template>

        <template v-else-if="mode === 'missions'">
          <div class="panel-head"><h2>任务列表</h2><span class="sub">当前城市：{{ detail ? detail.city.name : '—' }}</span></div>
          <div v-if="detail">
            <h3>固定任务</h3>
            <div v-for="m in detail.missions" :key="m.id" class="menu-row" style="margin-bottom:6px">
              <span class="nm">{{ m.name }}</span>
              <button style="padding:2px 8px;font-size:11px" @click="startFixed(m)">开团</button>
            </div>
            <div v-if="!detail.missions.length" class="sub">无。</div>
            <div class="hr"></div>
            <h3>随机任务</h3>
            <div v-for="s in detail.random_missions" :key="s.id" class="menu-row" style="margin-bottom:6px">
              <span class="nm">{{ s.name }}</span>
              <span class="sub">难度 {{ s.difficulty }}</span>
            </div>
          </div>
        </template>

        <template v-else-if="mode === 'links'">
          <div class="panel-head"><h2>参与关系</h2><span class="sub">谁在哪座城、能做多难的案子</span></div>
          <table>
            <thead><tr><th>人物</th><th>出身</th><th>难度</th><th>状态</th></tr></thead>
            <tbody>
              <tr v-for="p in roster" :key="p.id">
                <td>{{ p.name }}</td>
                <td class="mono dim">{{ p.city_name }}</td>
                <td class="mono">{{ p.difficulty }}</td>
                <td>
                  <span class="chip" :class="p.kind === 'player' ? 'good' : ''">
                    {{ p.kind === 'player' ? '玩家' : 'NPC' }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </template>

        <div v-else class="empty">还在加载…</div>
      </div>

      <!-- 右：菜单栏 -->
      <div class="game-menu">
        <button class="menu-btn" :class="{ on: mode === 'people' }" @click="mode = 'people'">
          <span class="g">人</span><span class="l">人物</span>
        </button>
        <button class="menu-btn" :class="{ on: mode === 'missions' }" @click="mode = 'missions'">
          <span class="g">案</span><span class="l">任务</span>
        </button>
        <button class="menu-btn" :class="{ on: mode === 'links' }" @click="mode = 'links'">
          <span class="g">联</span><span class="l">参与</span>
        </button>
        <button class="menu-btn" :class="{ on: mode === 'city' }" @click="mode = 'city'" :disabled="!detail">
          <span class="g">城</span><span class="l">城市</span>
        </button>

        <div class="sub" style="margin-top:10px;line-height:1.6">
          当前人物：<br>
          <b style="color:var(--fg)">{{ selected ? selected.name : '未选' }}</b>
        </div>
      </div>
    </div>
  </div>
</template>
