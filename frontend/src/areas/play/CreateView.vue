<script setup lang="ts">
/**
 * 新建角色：掷点、选流派与本命五行、挑出身事件，最后建档。
 *
 * 职责：
 *     维护一张玩家自建卡的表单状态；掷点结果来自 /api/characters/roll，
 *     可选事件按「城市行业」过滤（与后端 events.compatible 的口径一致）。
 * 为什么需要：
 *     自建是单人模式下的唯一主角入口，表单字段与校验口径都在这一处。
 * 上下游：
 *     上游：/api/world、/api/events、/api/characters/roll、/api/characters；
 *     下游：建档成功后跳到 /characters/:id。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { api } from '../../shared/api'
import type { AttrRollPayload } from '../../shared/api'
import { setFlash } from '../../shared/flash'
import type { City, EventItem, WorldData } from '../../shared/types'

/** 自建表单：属性单独走掷点，这里只存文字与选择。 */
interface PlayerForm {
  name: string
  city: string
  school: string
  element: string
  events: string[]
  notes: string
}

const router = useRouter()
const world = ref<WorldData | null>(null)
const events = ref<EventItem[]>([])
const err = ref('')
const busy = ref(false)
const rolling = ref(false)
const roll = ref<AttrRollPayload | null>(null)

const form = ref<PlayerForm>({
  name: '',
  city: 'nanyu',
  school: 'fulu',
  element: '火',
  events: [],
  notes: ''
})

/** 六维在界面上的顺序与中文名（掷点结果按 key 取值）。 */
const KEYS: Array<{ key: string; label: string }> = [
  { key: 'str', label: '力' }, { key: 'agi', label: '敏' }, { key: 'con', label: '体' },
  { key: 'int', label: '智' }, { key: 'wil', label: '意' }, { key: 'per', label: '感' }
]

/** 流派的展示文案；真正的加成在 backend/app/engine/sheet.py。 */
const SCHOOLS: Array<{ key: string; label: string; note: string }> = [
  { key: 'fulu', label: '符箓派', note: '灵力=智×2，符力另算' },
  { key: 'neidan', label: '内丹派', note: '灵力=意×2，法术最强' },
  { key: 'guti', label: '体修', note: '气血=体×5，硬扛' },
  { key: 'jianxiu', label: '剑修', note: '剑意=意×2，兵毁则崩' },
  { key: 'anqi', label: '暗器', note: '杀气=敏×2，蓄爆' }
]

/** 掷一套属性（总值恒 72，落点随机）。 */
async function reroll(): Promise<void> {
  if (rolling.value) return
  rolling.value = true
  try {
    roll.value = await api.rollAttrs()
  } catch (e) {
    setFlash('掷点失败：' + (e as Error).message, 'err')
  } finally {
    rolling.value = false
  }
}

onMounted(async () => {
  try {
    const [w, e] = await Promise.all([api.world(), api.events()])
    world.value = w
    events.value = e.events
  } catch (e) {
    err.value = (e as Error).message
  }
  reroll()
})

const total = computed<number>(() =>
  roll.value ? KEYS.reduce((s, k) => s + Number(roll.value?.attrs[k.key] || 0), 0) : 0
)

const city = computed<City | undefined>(
  () => world.value?.cities.find(c => c.id === form.value.city)
)

/** 可选出身事件：只要通用事件，且城市行业与事件行业有交集。 */
const availableEvents = computed<EventItem[]>(() => {
  if (!city.value) return []
  return events.value.filter(e => {
    if (e.scope !== 'general') return false
    if (e.industries && e.industries.length &&
        !e.industries.some(i => city.value?.industries.includes(i))) return false
    return true
  })
})

/** 最多选 3 条；再点已选的会取消。 */
function toggleEvent(id: string): void {
  const list = form.value.events
  const idx = list.indexOf(id)
  if (idx >= 0) list.splice(idx, 1)
  else if (list.length < 3) list.push(id)
}

/** 建档：把掷点结果和表单一起交给后端，成功后跳角色卡。 */
async function submit(): Promise<void> {
  if (busy.value) return
  if (!form.value.name.trim()) {
    setFlash('先给角色起个名字。', 'err')
    return
  }
  const currentRoll = roll.value
  if (!currentRoll) {
    setFlash('还没掷点。', 'err')
    return
  }
  busy.value = true
  try {
    const out = await api.createPlayer({ ...form.value, attrs: currentRoll.attrs })
    setFlash(`已建档：${out.brief.name}（${out.code}）`)
    router.push(`/characters/${out.id}`)
  } catch (e) {
    setFlash((e as Error).message, 'err')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="err" class="panel"><div class="empty">加载失败：{{ err }}</div></div>
  <div v-else-if="!world" class="loading">LOADING / 正在准备建档表单…</div>

  <template v-else>
    <div class="page-head">
      <div>
        <h1>新建角色</h1>
        <div class="sub">player · 属性由骰子定，总值恒为 72；随机人物由系统生成</div>
      </div>
      <div class="tag-list">
        <router-link class="btn ghost" to="/roster">返回档案</router-link>
        <button class="primary" :disabled="busy" @click="submit">确认建档</button>
      </div>
    </div>

    <div class="grid c2">
      <div class="panel">
        <div class="panel-head"><h2>基本信息</h2><span class="sub">identity</span></div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <label>
            <div class="sub">姓名</div>
            <input v-model="form.name" maxlength="16" placeholder="例：沈砚"
                   style="width:100%;padding:7px 10px;background:#0e141b;border:1px solid var(--line-2);border-radius:6px;color:var(--fg)">
          </label>
          <label>
            <div class="sub">出身城市</div>
            <select v-model="form.city"
                    style="width:100%;padding:7px 10px;background:#0e141b;border:1px solid var(--line-2);border-radius:6px;color:var(--fg)">
              <option v-for="c in world.cities" :key="c.id" :value="c.id">
                {{ c.name }}（{{ c.tier_name }} · 事件上限 {{ c.max_events }}）
              </option>
            </select>
          </label>
          <label>
            <div class="sub">流派</div>
            <select v-model="form.school"
                    style="width:100%;padding:7px 10px;background:#0e141b;border:1px solid var(--line-2);border-radius:6px;color:var(--fg)">
              <option v-for="s in SCHOOLS" :key="s.key" :value="s.key">{{ s.label }} —— {{ s.note }}</option>
            </select>
          </label>
          <label>
            <div class="sub">本命五行</div>
            <div class="tag-list">
              <button v-for="el in ['金','木','水','火','土']" :key="el"
                      :class="{ primary: form.element === el }" @click="form.element = el">{{ el }}</button>
            </div>
          </label>
          <label>
            <div class="sub">备注</div>
            <input v-model="form.notes" maxlength="200" placeholder="一句话来历"
                   style="width:100%;padding:7px 10px;background:#0e141b;border:1px solid var(--line-2);border-radius:6px;color:var(--fg)">
          </label>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <h2>属性掷点</h2>
          <span class="sub">
            合计 {{ total }}/72
            <button style="margin-left:8px;padding:2px 10px;font-size:11px"
                    :class="{ spin: rolling }" :disabled="rolling" @click="reroll">重掷</button>
          </span>
        </div>
        <div v-if="roll" style="display:flex;flex-direction:column;gap:8px">
          <div v-for="k in KEYS" :key="k.key" style="display:flex;align-items:center;gap:10px">
            <span class="sub" style="width:28px">{{ k.label }}</span>
            <span class="mono" style="width:34px;text-align:center;font-size:18px">{{ roll.attrs[k.key] }}</span>
            <span class="bar" style="flex:1">
              <i :style="{ width: (roll.attrs[k.key] / 20 * 100) + '%' }"></i>
            </span>
          </div>
        </div>
        <div v-else class="loading">掷点中…</div>
        <div class="hr"></div>
        <div class="sub">
          每条属性 4d6 去最低（6–18），掷完再由骰子随机补点或扣点，凑到正好 72。
          不满意就重掷——总值不变，配比会变。
        </div>
        <div class="sub" style="margin-top:6px">seed {{ roll?.seed }}</div>
      </div>
    </div>

    <div class="panel" style="margin-top:14px">
      <div class="panel-head">
        <h2>出身事件</h2>
        <span class="sub">{{ form.events.length }}/3 · 只列这座城市能长出来的通用事件</span>
      </div>
      <div class="lede" style="margin-bottom:10px">
        选中的事件会给你特性，也会推高「难案倾向」——甲级事件越多，接到的案子越硬，报酬越高。
      </div>
      <div class="tag-list">
        <button v-for="e in availableEvents" :key="e.id"
                :class="{ primary: form.events.includes(e.id) }"
                @click="toggleEvent(e.id)" :title="e.hook">
          {{ e.name }} · {{ e.grade_name }}
        </button>
        <span v-if="!availableEvents.length" class="sub">这座城市没有可用事件。</span>
      </div>
    </div>
  </template>
</template>
