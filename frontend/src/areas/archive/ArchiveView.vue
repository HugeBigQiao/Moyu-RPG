<script setup lang="ts">
/**
 * 背景档案页：左目录、中列表、右详情，外加新增 / 编辑 / 删除入口。
 *
 * 职责：
 *     取一次内容数据并缓存，维护「当前类别 / 选中项 / 编辑器 / 删除确认」四份状态，
 *     把选中项交给 details/ 下对应的类别组件渲染。
 * 为什么需要：
 *     11 类内容共用一个入口；读、写、校验在这里收口，详情组件只做展示，
 *     这样加一个类别不会牵动其它类别。
 * 上下游：
 *     上游：/api/world|events|missions|equipment|traits|scenarios（读）、
 *           /api/archive/{kind}（写）；
 *     下游：ArchiveEditor（表单弹层）、details/*（详情）、本文件模板。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ArchiveEditor from './ArchiveEditor.vue'
import { DETAILS } from './details'
import { SPECS, idOf, optionGroups } from './archiveSpecs'
import { api } from '../../shared/api'
import { setFlash } from '../../shared/flash'
import type {
  ArchiveItem,
  ArchiveKind,
  EquipmentPayload,
  EventsPayload,
  MissionsPayload,
  ScenarioPayload,
  TraitsPayload,
  WorldData
} from '../../shared/types'

/** 一个类别：key 与后端 edit.py 一致，group 决定从哪份接口数据里取列表。 */
interface KindDef {
  key: ArchiveKind
  name: string
  group: 'world' | 'events' | 'missions' | 'equipment' | 'traits'
  /** 从接口响应里取出这一类的条目数组 */
  pick: (data: any) => ArchiveItem[]
}

const KINDS: KindDef[] = [
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

/** 一次性拉回来的内容缓存；编辑器里的下拉选项也靠它拼。 */
interface ArchiveCache {
  world?: WorldData
  events?: EventsPayload
  missions?: MissionsPayload
  equipment?: EquipmentPayload
  traits?: TraitsPayload
  scenarios?: ScenarioPayload
}

/** 列表里的这一行：原始条目 + 列表要显示的标题与副标题。 */
interface ArchiveRow {
  raw: ArchiveItem
  id: string
  title: string
  sub: string
}

/** 编辑弹层的状态；新建时 item 为 null。 */
interface EditorState {
  mode: 'create' | 'edit'
  kindKey: ArchiveKind
  item: ArchiveItem | null
}

const route = useRoute()
const router = useRouter()

const cache = ref<ArchiveCache>({})
const options = ref<Record<string, Array<{ value: string | number; label: string }>>>({})
const loading = ref(false)
const err = ref('')
const selected = ref(0)

// 编辑器的开关与状态
const editor = ref<EditorState | null>(null)
const saving = ref(false)
const saveError = ref('')
const pendingDelete = ref<ArchiveItem | null>(null)
const deleting = ref(false)

const kind = computed<KindDef>(
  () => KINDS.find(k => k.key === ((route.params.kind as ArchiveKind) || 'cities')) || KINDS[0]
)
const spec = computed(() => SPECS[kind.value.key])
const items = computed<ArchiveRow[]>(() => {
  const k = kind.value
  const data = cache.value[k.group]
  if (!data) return []
  return k.pick(data).map(raw => ({
    raw,
    id: String(raw.id || raw.name || raw.title || ''),
    title: String(raw.name || raw.title || ''),
    sub: subtitle(raw)
  }))
})
const current = computed<ArchiveRow | null>(() => items.value[selected.value] || null)

// 关系里存的是对象 id，展示时换成中文名（教派 / 国家 / 机构 / 人物都查一遍）
const nameMap = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {}
  const world = cache.value.world
  if (!world) return map
  for (const group of [world.sects, world.nations, world.agencies, world.figures]) {
    for (const item of group) map[item.id] = item.name
  }
  return map
})

// 详情组件的入参：只有教派需要 id → 中文名映射，其它类别只吃 item
const detailBind = computed<Record<string, any>>(() => {
  const raw = current.value?.raw
  if (!raw) return {}
  return kind.value.key === 'sects'
    ? { item: raw, nameMap: nameMap.value }
    : { item: raw }
})

/** 列表第二行的小字：各类别取最能说明身份的那个字段。 */
function subtitle(raw: ArchiveItem): string {
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

/** 弹层标题与删除确认里用的名字，缺 name 时退回 title / id。 */
function displayName(raw: ArchiveItem | null): string {
  if (!raw) return ''
  return raw.name || raw.title || raw.id || ''
}

/** 一次性把编辑需要的几组数据都取回来：下拉选项要靠它们拼。 */
async function ensureAll(): Promise<void> {
  if (loading.value) return
  loading.value = true
  err.value = ''
  try {
    const [world, events, missions, equipment, traits, scenarios] = await Promise.all([
      api.world(), api.events(), api.missions(), api.equipment(), api.traits(), api.scenarios()
    ])
    cache.value = { world, events, missions, equipment, traits, scenarios }
    options.value = optionGroups(cache.value)
  } catch (e) {
    err.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

/** 切换左侧分类；路由变化由下面的 watch 负责重取。 */
function go(key: ArchiveKind): void {
  router.push(`/archive/${key}`)
}

/** 保存/删除后按 id 重新选中，避免列表刷新把选中项跳回第一条。 */
function selectById(itemId: string): void {
  const index = items.value.findIndex(item => item.id === itemId)
  selected.value = index < 0 ? 0 : index
}

function openCreate(): void {
  saveError.value = ''
  editor.value = { mode: 'create', kindKey: kind.value.key, item: null }
}

function openEdit(): void {
  if (!current.value) return
  saveError.value = ''
  editor.value = { mode: 'edit', kindKey: kind.value.key, item: current.value.raw }
}

function closeEditor(): void {
  editor.value = null
  saveError.value = ''
}

/** 保存：新建走 POST，编辑走 PUT；成功后重取全部内容并选中这一条。 */
async function onSave(payload: ArchiveItem): Promise<void> {
  if (!editor.value) return
  const key = editor.value.kindKey
  const editSpec = SPECS[key]
  saving.value = true
  saveError.value = ''
  try {
    if (editor.value.mode === 'create') {
      await api.archiveCreate(key, payload)
    } else {
      await api.archiveUpdate(key, idOf(editSpec, editor.value.item as ArchiveItem), payload)
    }
    const savedId = idOf(editSpec, payload)
    editor.value = null
    await ensureAll()
    selectById(savedId)
    setFlash('已写回 content JSON', 'ok')
  } catch (e) {
    saveError.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

function askDelete(): void {
  if (!current.value) return
  pendingDelete.value = current.value.raw
}

/** 删除：被引用时后端会返回 400，这里用 toast 显示原因。 */
async function confirmDelete(): Promise<void> {
  if (!pendingDelete.value) return
  deleting.value = true
  try {
    await api.archiveDelete(kind.value.key, idOf(SPECS[kind.value.key], pendingDelete.value))
    pendingDelete.value = null
    await ensureAll()
    selected.value = 0
    setFlash('已删除，并写回 JSON', 'ok')
  } catch (e) {
    pendingDelete.value = null
    setFlash((e as Error).message, 'err')
  } finally {
    deleting.value = false
  }
}

onMounted(ensureAll)
watch(() => route.params.kind, () => {
  selected.value = 0
  pendingDelete.value = null
  ensureAll()
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
          <span class="n" v-if="cache[k.group]">
            {{ cache[k.group] ? k.pick(cache[k.group]).length : '' }}
          </span>
        </a>
      </aside>

      <section class="arch-body">
        <div class="page-head" style="margin-bottom:12px">
          <div>
            <h1 style="font-size:18px">{{ kind.name }}</h1>
            <div class="sub">{{ items.length }} 条 · 左侧选择，右侧看详情，改完直接写回 JSON</div>
          </div>
          <div class="arch-tools">
            <button class="primary" @click="openCreate">＋ 新增</button>
            <button :disabled="!current" @click="openEdit">编辑</button>
            <button class="danger" :disabled="!current" @click="askDelete">删除</button>
          </div>
        </div>

        <div v-if="pendingDelete" class="arch-confirm">
          <span>确定删除「{{ displayName(pendingDelete) }}」？删掉会直接写回 JSON（git 里能回滚）。</span>
          <div>
            <button class="danger" :disabled="deleting" @click="confirmDelete">
              {{ deleting ? '删除中…' : '确认删除' }}
            </button>
            <button class="ghost" @click="pendingDelete = null">取消</button>
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
              <!-- 详情按类别拆在 details/ 下，这里只负责把选中项交给对应组件 -->
              <component :is="DETAILS[kind.key]" v-bind="detailBind" />
            </div>
            <div v-else class="panel">
              <div class="empty">这一类还没有内容。</div>
              <div style="text-align:center;margin-top:-6px;padding-bottom:10px">
                <button class="primary" @click="openCreate">＋ 新增第一条</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <ArchiveEditor
      v-if="editor"
      :key="`${editor.kindKey}-${editor.mode}-${editor.item ? (editor.item.id || editor.item.name) : 'new'}`"
      :spec="SPECS[editor.kindKey]"
      :item="editor.item"
      :title="(editor.mode === 'create' ? '新增' : '编辑') + SPECS[editor.kindKey].label"
      :subtitle="editor.mode === 'create' ? '新条目会追加到文件末尾，保存后立刻生效' : `正在编辑「${displayName(editor.item)}」`"
      :options="options"
      :busy="saving"
      :error="saveError"
      @save="onSave"
      @close="closeEditor"
    />
  </div>
</template>
