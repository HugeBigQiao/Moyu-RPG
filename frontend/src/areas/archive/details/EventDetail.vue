<script setup lang="ts">
/**
 * 事件详情。
 *
 * 职责：
 *     把一条事件数据渲染成档案页右侧的详情面板（等级、适用范围、赋予特性、限定任务）。
 * 为什么需要：
 *     11 类档案的字段结构完全不同；按类别拆开后，改版式或加字段只动这一份文件，
 *     不用在 ArchiveView 的 v-if 长链里找自己这一类，也不会误改别的类别。
 * 上下游：
 *     上游：areas/archive/ArchiveView.vue 把选中项通过 item 传进来；
 *     下游：无——纯展示组件，不发请求、不改数据。
 */
import type { ArchiveItem } from '../../../shared/types'

defineProps<{
  /** 当前选中的条目。字段随类别不同，按内容 JSON 的原始结构取用。 */
  item: ArchiveItem
}>()
</script>

<template>
  <div class="panel-head">
    <h2>{{ item.name }}</h2>
    <span class="sub">{{ item.grade_name }} · {{ item.scope === 'mission' ? '限定任务' : '通用' }}</span>
  </div>
  <div class="lede">{{ item.text }}</div>
  <div class="hr"></div>
  <div class="sub">钩子：{{ item.hook }}</div>
  <div class="hr"></div>
  <h3>赋予特性</h3>
  <div class="tag-list">
    <span v-for="t in item.trait_names" :key="t.name" class="chip violet">{{ t.name }}</span>
  </div>
  <div v-if="item.missions && item.missions.length" style="margin-top:12px">
    <h3>限定任务</h3>
    <div class="tag-list">
      <span v-for="m in item.missions" :key="m" class="chip accent">{{ m }}</span>
    </div>
  </div>
</template>
