<script setup lang="ts">
/**
 * 城市详情。
 *
 * 职责：
 *     把一条城市数据渲染成档案页右侧的详情面板（等级、国家、行业、地标、当地势力）。
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
    <span class="sub">{{ item.tier_name }} · {{ item.nation_name }} · {{ item.pop }} 万</span>
  </div>
  <div class="lede">{{ item.blurb }}</div>
  <div class="hr"></div>
  <div class="kv-grid">
    <span class="k">事件上限</span><span class="v">{{ item.max_events }} 条</span>
    <span class="k">坐标</span><span class="v">{{ Number(item.lat).toFixed(2) }}, {{ Number(item.lon).toFixed(2) }}</span>
  </div>
  <div class="hr"></div>
  <h3>行业</h3>
  <div class="tag-list">
    <span v-for="n in item.industry_names" :key="n" class="chip">{{ n }}</span>
  </div>
  <h3 style="margin-top:14px">地标</h3>
  <div class="tag-list">
    <span v-for="n in item.landmarks" :key="n" class="chip accent">{{ n }}</span>
  </div>
  <h3 style="margin-top:14px">当前势力</h3>
  <div v-for="f in item.factions" :key="f.name" class="ev" style="margin-bottom:6px">
    <div class="tag">{{ f.kind }}</div>
    <div class="txt"><b>{{ f.name }}</b> —— {{ f.note }}</div>
  </div>
</template>
