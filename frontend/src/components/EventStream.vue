<script setup>
defineProps({
  events: { type: Array, default: () => [] }
})

const LABEL = {
  check: 'check', attack: 'hit', damage: 'dmg', hurt: 'hurt',
  kp: 'KP', scene: 'stage', encounter: 'alert', clear: 'clear',
  talisman: 'talis', reveal: 'reveal', ending: 'close', story: 'narr',
  clue: 'clue', corruption: 'load', san: 'san', heal: 'heal',
  ward: 'ward', summon: 'summon', choice: 'karma', karma: 'karma',
  draw: 'draw', flee: 'flee', note: 'note', env: 'env', down: 'down',
  control: 'ctrl', calm: 'calm', merit: 'merit'
}
</script>

<template>
  <div class="stream">
    <div
      v-for="(ev, i) in events"
      :key="i"
      class="ev"
      :class="[ev.severity || 'info', ev.kind === 'kp' ? 'kp' : '', ev.kind === 'ending' ? 'ending' : '']"
    >
      <div class="tag">{{ LABEL[ev.kind] || ev.kind }}</div>
      <div class="txt">{{ ev.text }}</div>
    </div>
    <div v-if="!events.length" class="empty">还没有事件。</div>
  </div>
</template>
