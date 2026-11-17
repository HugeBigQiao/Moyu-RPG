<script setup lang="ts">
/**
 * 特性详情。
 *
 * 职责：
 *     把一条特性数据渲染成档案页右侧的详情面板（品级、描述、数值效果）。
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
    <span class="sub">{{ item.tier_name }}</span>
  </div>
  <div class="lede">{{ item.desc }}</div>
  <div class="hr"></div>
  <div class="tag-list">
    <span v-for="(v, k) in item.effect" :key="k" class="chip">
      {{ k }} {{ v > 0 ? '+' : '' }}{{ v }}
    </span>
  </div>
</template>
