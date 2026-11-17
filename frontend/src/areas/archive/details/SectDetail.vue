<script setup lang="ts">
/**
 * 教派详情。
 *
 * 职责：
 *     把一条教派数据渲染成档案页右侧的详情面板（宗旨、资源、与其他势力的关系（id 换成中文名））。
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

  /** 关系里存的是对象 id，这里映射成中文名；查不到就退回 id。 */
  nameMap?: Record<string, string>
}>()
</script>

<template>
  <div class="panel-head">
    <h2>{{ item.name }}</h2>
    <span class="sub">{{ item.tradition }}</span>
  </div>
  <div class="lede">{{ item.blurb }}</div>
  <div class="hr"></div>
  <div class="kv-grid">
    <span class="k">宗旨</span><span class="v">{{ item.doctrine }}</span>
    <span class="k">资源</span><span class="v">{{ item.resource }}</span>
  </div>
  <div class="hr"></div>
  <h3>与其他势力的关系</h3>
  <div class="tag-list">
    <span v-for="(rel, k) in item.relations" :key="k" class="chip">
      {{ nameMap?.[k] || k }}：{{ rel }}
    </span>
  </div>
</template>
