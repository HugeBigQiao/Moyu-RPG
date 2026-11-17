<script setup lang="ts">
/**
 * 国家详情。
 *
 * 职责：
 *     把一条国家数据渲染成档案页右侧的详情面板（时代、体制、对祟物的态度）。
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
    <span class="sub">{{ item.era }}</span>
  </div>
  <div class="sub" style="margin-bottom:8px">{{ item.gov }}</div>
  <div class="lede">{{ item.blurb }}</div>
  <div class="hr"></div>
  <div class="sub">立场：{{ item.stance }}</div>
</template>
