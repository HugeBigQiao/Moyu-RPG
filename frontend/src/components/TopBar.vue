<script setup>
defineProps({ crumb: { type: String, default: '' } })
</script>

<template>
  <header class="top">
    <div class="crumb"><b>{{ crumb }}</b></div>
    <div class="top-right">
      <span class="dot ok"></span>集群正常
      <span class="sep">/</span>XUANWU EDGE OPS
    </div>
  </header>
</template>
