<script setup>
import { settings, themes, sizes, resetSettings } from '../settings'

defineEmits(['close'])
</script>

<template>
  <div class="settings-mask" @click.self="$emit('close')">
    <aside class="settings-panel">
      <div class="panel-head">
        <h2>设置</h2>
        <button class="ghost" @click="$emit('close')">关闭</button>
      </div>

      <section>
        <h3>页面风格</h3>
        <div class="theme-grid">
          <button
            v-for="t in themes"
            :key="t.key"
            class="theme-card"
            :class="[t.key, { on: settings.theme === t.key }]"
            @click="settings.theme = t.key"
          >
            <span class="swatch"></span>
            <b>{{ t.name }}</b>
            <em>{{ t.hint }}</em>
          </button>
        </div>
      </section>

      <section>
        <h3>字体大小</h3>
        <div class="tag-list">
          <button
            v-for="s in sizes"
            :key="s.key"
            :class="{ primary: settings.size === s.key }"
            @click="settings.size = s.key"
          >{{ s.name }} · {{ s.key }}px</button>
        </div>
        <div class="lede" style="margin-top:8px;font-size:12px">
          例子：玄门诡事录 · 祟物 · 阴浊 · 五行生克
        </div>
      </section>

      <section>
        <h3>动效</h3>
        <label class="switch">
          <input type="checkbox" v-model="settings.motion" />
          <span>页面切换与按钮动效</span>
        </label>
      </section>

      <div class="hr"></div>
      <div class="tag-list">
        <button class="ghost" @click="resetSettings">恢复默认</button>
      </div>
      <div class="sub" style="margin-top:10px">设置只存在这台机器上（localStorage）。</div>
    </aside>
  </div>
</template>
