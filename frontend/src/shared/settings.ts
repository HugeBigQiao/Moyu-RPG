/**
 * 界面设置的状态与持久化。
 *
 * 职责：
 *     主题、字号、动效、遮掩方式四组设置的读写；改完立即应用到 <html>。
 * 为什么需要：
 *     这些设置跨页面共享；存 localStorage，重启浏览器仍然是上次那套。
 * 上下游：
 *     上游：app/SettingsPanel.vue（用户操作）、app/App.vue（启动时 init）；
 *     下游：shared/stealth.ts（读 stealthMode）、style.css（data-theme 变量）。
 */
import { reactive, watch } from 'vue'

const KEY = 'moyu:settings'

export type ThemeKey = 'dark' | 'light' | 'ink'
export type SizeValue = 13 | 15 | 17 | 19
export type StealthMode = 'off' | 'blur' | 'fake'

export interface ThemeOption {
  key: ThemeKey
  name: string
  hint: string
}

export interface SizeOption {
  key: SizeValue
  name: string
}

export interface StealthModeOption {
  key: StealthMode
  name: string
  hint: string
}

export interface SettingsState {
  theme: ThemeKey
  size: SizeValue
  motion: boolean
  stealthMode: StealthMode
  stealthAuto: boolean
}

export const themes: ThemeOption[] = [
  { key: 'dark', name: '深色控制台', hint: '默认。机房那种冷光' },
  { key: 'light', name: '浅色纸张', hint: '公文与档案的观感' },
  { key: 'ink', name: '墨色', hint: '宣纸底、墨线，旧书味' }
]

export const sizes: SizeOption[] = [
  { key: 13, name: '小' },
  { key: 15, name: '标准' },
  { key: 17, name: '大' },
  { key: 19, name: '特大' }
]

export const stealthModes: StealthModeOption[] = [
  { key: 'off', name: '不遮掩', hint: '正常显示' },
  { key: 'blur', name: '模糊', hint: '整页虚化 + 锁屏提示' },
  { key: 'fake', name: '伪装页', hint: '换成一页运维文档' }
]

export const settings = reactive<SettingsState>({
  theme: 'dark',
  size: 15,
  motion: true,
  stealthMode: 'blur',
  stealthAuto: true
})

/** 从 localStorage 恢复；坏数据或隐私模式一律忽略，保持默认值。 */
function load(): void {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return
    const saved = JSON.parse(raw) as Partial<SettingsState>
    if (saved.theme && themes.some(t => t.key === saved.theme)) settings.theme = saved.theme
    if (saved.size && sizes.some(s => s.key === saved.size)) settings.size = saved.size
    if (typeof saved.motion === 'boolean') settings.motion = saved.motion
    if (saved.stealthMode && stealthModes.some(s => s.key === saved.stealthMode)) {
      settings.stealthMode = saved.stealthMode
    }
    if (typeof saved.stealthAuto === 'boolean') settings.stealthAuto = saved.stealthAuto
  } catch {
    // 坏数据：宁可回到默认值，也不要让设置页崩掉
  }
}

/** 把设置写到 <html> 上：主题与动效走 data-*，字号走 CSS 变量。 */
export function applySettings(): void {
  const root = document.documentElement
  root.dataset.theme = settings.theme
  root.dataset.motion = settings.motion ? 'on' : 'off'
  root.style.setProperty('--base-size', settings.size + 'px')
}

export function resetSettings(): void {
  settings.theme = 'dark'
  settings.size = 15
  settings.motion = true
  settings.stealthMode = 'blur'
  settings.stealthAuto = true
}

/** 启动时调用一次：先恢复，再挂持久化监听。 */
export function initSettings(): void {
  load()
  applySettings()
  watch(settings, () => {
    applySettings()
    try {
      localStorage.setItem(KEY, JSON.stringify(settings))
    } catch {
      // 无痕模式写不了 localStorage，只是这次不记住而已
    }
  })
}
