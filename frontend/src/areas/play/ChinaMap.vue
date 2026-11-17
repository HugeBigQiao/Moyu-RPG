<script setup lang="ts">
/**
 * 中国地图：把城市按经纬度投影成 SVG 落点。
 *
 * 职责：
 *     画陆地轮廓 + 城市点与标签；点中某个点就把城市 id 抛给父组件。
 * 为什么需要：
 *     地图是「选城」的入口；轮廓由 backend/scripts/build_china_map.py 离线生成
 *     （assets/china.ts），不依赖任何在线地图服务。
 * 上下游：
 *     上游：areas/play/GameView.vue 传 cities / selected；
 *     下游：emit('select', id)；轮廓与投影函数来自 assets/china.ts。
 */
import { computed } from 'vue'

import { CHINA_PATHS, CHINA_VIEWBOX, project } from '../../assets/china'
import type { MapCity } from '../../shared/types'

const props = withDefaults(defineProps<{ cities?: MapCity[]; selected?: string }>(), {
  cities: () => [],
  selected: ''
})
const emit = defineEmits<{ (e: 'select', id: string): void }>()

/** 几座城市挨得太近，标签互相压着，这里手工挪一下偏移与左右锚点。 */
interface Nudge {
  dx?: number
  dy?: number
  anchor?: 'start' | 'end'
}

const NUDGE: Record<string, Nudge> = {
  linjing: { dx: -16, dy: -12, anchor: 'end' },
  yunjin: { dx: 14, dy: 18, anchor: 'start' },
  nanyu: { dx: 12, dy: 20, anchor: 'start' },
  chaoyu: { dx: 14, dy: 14, anchor: 'start' },
  baishi: { dx: -14, dy: 10, anchor: 'end' }
}

/** 投影后的落点：城市字段 + 屏幕坐标 + 标签锚点与偏移。 */
interface MapPoint extends MapCity {
  x: number
  y: number
  anchor: 'start' | 'end'
  dx: number
  dy: number
}

const points = computed<MapPoint[]>(() =>
  props.cities.map((city, index) => {
    const [x, y] = project(city.lon, city.lat)
    const nudge = NUDGE[city.id] || {}
    // 标签左右交错，减少重叠
    const anchor: 'start' | 'end' = nudge.anchor || (x > 780 ? 'end' : 'start')
    return {
      ...city,
      x,
      y,
      anchor,
      dx: nudge.dx != null ? nudge.dx : (x > 780 ? -10 : 10),
      dy: nudge.dy != null ? nudge.dy : (index % 2 === 0 ? -10 : 18)
    }
  })
)
</script>

<template>
  <div class="mapbox">
    <svg :viewBox="CHINA_VIEWBOX" class="china-map" role="img" aria-label="中国地图">
      <g class="land">
        <path v-for="(d, i) in CHINA_PATHS" :key="i" :d="d" />
      </g>
      <g class="cities">
        <g
          v-for="p in points"
          :key="p.id"
          class="city-node"
          :class="{ on: selected === p.id, big: p.tier === 't0' || p.tier === 't1' }"
          @click="emit('select', p.id)"
        >
          <circle :cx="p.x" :cy="p.y" :r="p.tier === 't0' ? 7 : p.tier === 't1' ? 6 : 4.5" />
          <circle :cx="p.x" :cy="p.y" :r="14" class="halo" />
          <text :x="p.x + p.dx" :y="p.y + p.dy" :text-anchor="p.anchor">{{ p.name }}</text>
          <text :x="p.x + p.dx" :y="p.y + p.dy + 13" :text-anchor="p.anchor" class="meta">
            {{ p.tier_name }} · {{ p.people }} 人
          </text>
        </g>
      </g>
    </svg>
    <div class="map-legend">
      <span><i class="lg t0"></i>特级</span>
      <span><i class="lg t1"></i>一级</span>
      <span><i class="lg t2"></i>二级以下</span>
    </div>
  </div>
</template>
