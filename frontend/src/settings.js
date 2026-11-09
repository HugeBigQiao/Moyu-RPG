import { reactive, watch } from 'vue'

const KEY = 'moyu:settings'

export const themes = [
  { key: 'dark', name: '深色控制台', hint: '默认。机房那种冷光' },
  { key: 'light', name: '浅色纸张', hint: '公文与档案的观感' },
  { key: 'ink', name: '墨色', hint: '宣纸底、墨线，旧书味' }
]

export const sizes = [
  { key: 13, name: '小' },
  { key: 15, name: '标准' },
  { key: 17, name: '大' },
  { key: 19, name: '特大' }
]

export const settings = reactive({
  theme: 'dark',
  size: 15,
  motion: true
})

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return
    const saved = JSON.parse(raw)
    if (themes.some(t => t.key === saved.theme)) settings.theme = saved.theme
    if (sizes.some(s => s.key === saved.size)) settings.size = saved.size
    if (typeof saved.motion === 'boolean') settings.motion = saved.motion
  } catch (e) { /* 忽略坏数据 */ }
}

export function applySettings() {
  const root = document.documentElement
  root.dataset.theme = settings.theme
  root.dataset.motion = settings.motion ? 'on' : 'off'
  root.style.setProperty('--base-size', settings.size + 'px')
}

export function resetSettings() {
  settings.theme = 'dark'
  settings.size = 15
  settings.motion = true
}

export function initSettings() {
  load()
  applySettings()
  watch(settings, () => {
    applySettings()
    try { localStorage.setItem(KEY, JSON.stringify(settings)) } catch (e) { /* 无痕模式 */ }
  })
}
