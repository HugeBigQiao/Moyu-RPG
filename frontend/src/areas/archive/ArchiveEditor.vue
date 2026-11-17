<script setup lang="ts">
/**
 * 档案编辑表单（新增与编辑共用一个弹层）。
 *
 * 职责：
 *     按 archiveSpecs 的字段规格渲染表单，收齐后 emit('save', payload)。
 * 为什么需要：
 *     11 类档案字段各不相同；用一份「规格 + 通用控件」比写 11 个表单省，
 *     加字段只要改 archiveSpecs.ts，这个组件不用动。
 * 上下游：
 *     上游：areas/archive/ArchiveView.vue 传 spec / item / options；
 *     下游：emit('save', payload) 交给 ArchiveView 调接口。
 */
import { computed, reactive, ref } from 'vue'

import { emptyForm, formToPayload, itemToForm, missingRequired } from './archiveSpecs'
import type { ArchiveSpec, FieldSpec, SubField } from './archiveSpecs'
import type { ArchiveItem, FieldOption } from '../../shared/types'

const props = withDefaults(defineProps<{
  spec: ArchiveSpec
  /** 新建时为 null */
  item?: ArchiveItem | null
  title?: string
  subtitle?: string
  options?: Record<string, FieldOption[]>
  busy?: boolean
  error?: string
}>(), {
  item: null,
  title: '编辑',
  subtitle: '',
  options: () => ({}),
  busy: false,
  error: ''
})

const emit = defineEmits<{ (e: 'save', payload: ArchiveItem): void; (e: 'close'): void }>()

const form = reactive<Record<string, any>>(
  props.item ? itemToForm(props.spec, props.item) : emptyForm(props.spec)
)
/** 「自由标签」输入框里还没回车的那一截文本。 */
const tagDraft = reactive<Record<string, string>>({})
const localError = ref('')

const isCreate = computed<boolean>(() => !props.item)

/** 按 showIf 过滤字段：比如「限定任务」只在适用范围选 mission 时出现。 */
const visibleFields = computed<FieldSpec[]>(() => props.spec.fields.filter(field => {
  if (!field.showIf) return true
  return field.showIf.in.includes(form[field.showIf.key])
}))

/** 取某个字段的下拉选项：优先用接口拼出来的那组，其次用字段自带的静态数组。 */
function opts(field: { source?: string; options?: FieldOption[] }, source?: string): FieldOption[] {
  const key = source || field.source
  if (key && props.options[key]) return props.options[key]
  return field.options || []
}

/** 标签显示名：选项里查得到就用中文名，查不到（自由标签）原样显示。 */
function labelFor(field: FieldSpec, value: string | number): string {
  const hit = opts(field).find(opt => opt.value === value)
  return hit ? hit.label : String(value)
}

/** 从下拉里选一个加入标签列表，然后清空下拉。 */
function addTagFromSelect(field: FieldSpec, event: Event): void {
  const target = event.target as HTMLSelectElement
  const value = target.value
  target.value = ''
  if (!value || form[field.key].includes(value)) return
  form[field.key].push(value)
}

/** 自由标签：回车把输入框里的文本加进去（去重、去空白）。 */
function addFreeTag(field: FieldSpec): void {
  const raw = (tagDraft[field.key] || '').trim()
  if (!raw) return
  if (!form[field.key].includes(raw)) form[field.key].push(raw)
  tagDraft[field.key] = ''
}

function removeTag(field: FieldSpec, index: number | string): void {
  form[field.key].splice(Number(index), 1)
}

/** 给 list 类字段加一行空数据（如城市「当地势力」）。 */
function addListItem(field: FieldSpec): void {
  const row: Record<string, string> = {}
  for (const sub of field.itemFields || []) row[sub.key] = ''
  form[field.key].push(row)
}

/** strmap / nummap 加一行：键先空着，值按类型给默认。 */
function newMapRow(field: FieldSpec): { key: string; value: string | number } {
  return { key: '', value: field.type === 'nummap' ? 1 : '' }
}

/** list 子字段的宽度：flex 撑满，固定宽度按 px，否则交给样式表。 */
function widthStyle(sub: SubField): Record<string, string> {
  if (sub.flex) return { flex: '1 1 auto' }
  if (sub.width) return { width: sub.width + 'px' }
  return {}
}

/** 提交前只查必填；格式与引用交给后端统一报错，避免两处规则不一致。 */
function submit(): void {
  localError.value = ''
  const payload = formToPayload(props.spec, form)
  const missing = missingRequired(props.spec, payload)
  if (missing.length) {
    localError.value = `还差：${missing.join('、')}`
    return
  }
  emit('save', payload)
}
</script>

<template>
  <div class="ed-backdrop" @click.self="emit('close')">
    <div class="ed-panel" role="dialog" aria-modal="true">
      <header class="ed-head">
        <div>
          <h2>{{ title }}</h2>
          <div class="ed-sub">{{ subtitle || spec.hint }}</div>
        </div>
        <button class="ghost" @click="emit('close')">关闭</button>
      </header>

      <div v-if="error || localError" class="ed-error">{{ error || localError }}</div>

      <div class="ed-grid">
        <div v-for="field in visibleFields" :key="field.key" class="ed-row" :class="{ wide: field.wide }">
          <label class="ed-label">
            {{ field.label }}
            <b v-if="field.required" class="ed-req">*</b>
            <em v-if="field.createOnly && !isCreate">不可改</em>
          </label>

          <input
            v-if="field.type === 'text' || field.type === 'id'"
            v-model="form[field.key]"
            :disabled="field.createOnly && !isCreate"
            :maxlength="field.max || 400"
            :placeholder="field.type === 'id' ? '英文小写，如 nanping' : ''"
          />

          <textarea
            v-else-if="field.type === 'textarea'"
            v-model="form[field.key]"
            :rows="field.rows || 3"
          ></textarea>

          <input
            v-else-if="field.type === 'number'"
            v-model.number="form[field.key]"
            type="number"
            :min="field.min"
            :max="field.max"
            :step="field.step || 1"
          />

          <select v-else-if="field.type === 'select'" v-model="form[field.key]">
            <option v-if="field.placeholder !== undefined" value="">{{ field.placeholder }}</option>
            <option v-for="opt in opts(field)" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>

          <div v-else-if="field.type === 'tags'" class="ed-tags">
            <span v-for="(tag, i) in form[field.key]" :key="tag" class="chip">
              {{ labelFor(field, tag) }}
              <i class="ed-x" title="移除" @click="removeTag(field, i)">×</i>
            </span>
            <select
              v-if="field.source"
              class="ed-add"
              @change="addTagFromSelect(field, $event)"
            >
              <option value="">＋ 添加</option>
              <option
                v-for="opt in opts(field)"
                :key="opt.value"
                :value="opt.value"
                :disabled="form[field.key].includes(opt.value)"
              >{{ opt.label }}</option>
            </select>
            <input
              v-else
              v-model="tagDraft[field.key]"
              class="ed-add"
              placeholder="输入后回车添加"
              @keydown.enter.prevent="addFreeTag(field)"
            />
          </div>

          <div v-else-if="field.type === 'list'" class="ed-list">
            <div v-for="(row, i) in form[field.key]" :key="i" class="ed-subrow">
              <template v-for="sub in (field.itemFields || [])" :key="sub.key">
                <select v-if="sub.type === 'select'" v-model="row[sub.key]" :style="widthStyle(sub)">
                  <option v-for="opt in opts(sub)" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
                <input v-else v-model="row[sub.key]" :placeholder="sub.label" :style="widthStyle(sub)" />
              </template>
              <button class="ghost danger" title="删掉这一条" @click="form[field.key].splice(i, 1)">✕</button>
            </div>
            <button class="ghost" @click="addListItem(field)">＋ 加一条</button>
          </div>

          <div v-else-if="field.type === 'strmap' || field.type === 'nummap'" class="ed-map">
            <div v-for="(row, i) in form[field.key]" :key="i" class="ed-subrow">
              <select v-if="field.keySource" v-model="row.key" style="width: 220px">
                <option value="">选择对象…</option>
                <option v-for="opt in opts(field, field.keySource)" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
              <input
                v-else
                v-model="row.key"
                :list="'dl-key-' + field.key"
                :placeholder="field.keyLabel || '键'"
                style="width: 160px"
              />
              <input
                v-if="field.type === 'nummap'"
                v-model.number="row.value"
                type="number"
                :placeholder="field.valueLabel || '数值'"
                style="width: 110px"
              />
              <input v-else v-model="row.value" :placeholder="field.valueLabel || '值'" style="flex: 1 1 auto" />
              <button class="ghost danger" title="删掉这一条" @click="form[field.key].splice(i, 1)">✕</button>
            </div>
            <datalist v-if="!field.keySource" :id="'dl-key-' + field.key">
              <option v-for="key in field.keySuggestions || []" :key="key" :value="key" />
            </datalist>
            <button class="ghost" @click="form[field.key].push(newMapRow(field))">＋ 加一条</button>
          </div>

          <div v-if="field.hint" class="ed-hint">{{ field.hint }}</div>
        </div>
      </div>

      <footer class="ed-foot">
        <span class="ed-sub">保存会写回 backend/data/content/*.json，立刻生效（git 里能回滚）</span>
        <div class="ed-actions">
          <button class="ghost" @click="emit('close')">取消</button>
          <button class="primary" :disabled="busy" @click="submit">{{ busy ? '保存中…' : '保存' }}</button>
        </div>
      </footer>
    </div>
  </div>
</template>
