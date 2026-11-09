<script setup>
import { computed } from 'vue'
import { CHINA_VIEWBOX, CHINA_PATHS, project } from '../assets/china'

const props = defineProps({
  cities: { type: Array, default: () => [] },
  selected: { type: String, default: '' }
})
const emit = defineEmits(['select'])

// 几座城市挨得太近，标签互相压着，手工挪一下
const NUDGE = {
  linjing: { dx: -16, dy: -12, anchor: 'end' },
  yunjin: { dx: 14, dy: 18, anchor: 'start' },
  nanyu: { dx: 12, dy: 20, anchor: 'start' },
  chaoyu: { dx: 14, dy: 14, anchor: 'start' },
  baishi: { dx: -14, dy: 10, anchor: 'end' }
}

const points = computed(() =>
  props.cities.map((city, index) => {
    const [x, y] = project(city.lon, city.lat)
    const nudge = NUDGE[city.id] || {}
    // 标签左右交错，减少重叠
    const anchor = nudge.anchor || (x > 780 ? 'end' : 'start')
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
