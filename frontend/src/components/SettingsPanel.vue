<script setup>
/**
 * 设置面板：页面风格、字号、动效、遮掩。
 *
 * 所有设置都存在 localStorage（见 settings.js），关掉页面再打开仍然有效。
 */
import { settings, stealthModes, sizes, themes, resetSettings } from '../settings'
import { HOTKEY_LABEL, cover } from '../stealth'

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

      <section>
        <h3>遮掩</h3>
        <div class="lede" style="margin-bottom:8px;font-size:12px">
          工位上有人过来时，一键把页面盖住。快捷键 <b>{{ HOTKEY_LABEL }}</b>，<b>Esc</b> 恢复。
        </div>
        <div class="theme-grid">
          <button
            v-for="m in stealthModes"
            :key="m.key"
            class="theme-card"
            :class="{ on: settings.stealthMode === m.key }"
            @click="settings.stealthMode = m.key"
          >
            <span class="swatch" :class="'sw-' + m.key"></span>
            <b>{{ m.name }}</b>
            <em>{{ m.hint }}</em>
          </button>
        </div>
        <label class="switch" style="margin-top:10px">
          <input type="checkbox" v-model="settings.stealthAuto" />
          <span>切到别的窗口时自动遮掩</span>
        </label>
        <div class="tag-list" style="margin-top:10px">
          <button :disabled="settings.stealthMode === 'off'" @click="cover">现在遮掩一次</button>
        </div>
      </section>

      <div class="hr"></div>
      <div class="tag-list">
        <button class="ghost" @click="resetSettings">恢复默认</button>
      </div>
      <div class="sub" style="margin-top:10px">设置只存在这台机器上（localStorage）。</div>
    </aside>
  </div>
</template>
