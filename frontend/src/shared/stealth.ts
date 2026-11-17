/**
 * 遮掩（摸鱼）状态。
 *
 * 职责：
 *     维护「当前是否遮住、上次用的是哪种遮法」，并接管快捷键与失焦自动遮掩。
 * 为什么需要：
 *     这是给工位场景用的：切走窗口要立刻盖住，Ctrl+Shift+H 要随时能切回来；
 *     状态必须是全站单例，所以放在模块里而不是组件里。
 * 上下游：
 *     上游：shared/settings.ts（stealthMode / stealthAuto）；
 *     下游：app/App.vue（挂载）、app/TopBar.vue、app/StealthOverlay.vue。
 */
import { reactive } from 'vue'

import { settings } from './settings'

export interface StealthState {
  /** 是否正盖着页面 */
  covered: boolean
  /** 上一次实际生效的遮法（'off' 时不会遮） */
  lastMode: 'blur' | 'fake'
}

export const stealth = reactive<StealthState>({
  covered: false,
  lastMode: 'blur'
})

export const HOTKEY_LABEL = 'Ctrl+Shift+H'

// 用户还没碰过页面时不自动遮掩：避免刚打开、窗口还没聚焦就被盖住
let hasInteracted = false

/** 设置里选了遮掩方式才启用整套逻辑。 */
function usable(): boolean {
  return settings.stealthMode !== 'off'
}

export function cover(): void {
  if (!usable()) return
  stealth.lastMode = settings.stealthMode === 'fake' ? 'fake' : 'blur'
  stealth.covered = true
}

export function reveal(): void {
  stealth.covered = false
}

export function toggle(): void {
  if (stealth.covered) reveal()
  else cover()
}

function onKeydown(event: KeyboardEvent): void {
  // Ctrl+Shift+H：遮掩 / 恢复
  if (event.ctrlKey && event.shiftKey && (event.key === 'H' || event.key === 'h')) {
    event.preventDefault()
    if (!usable()) return
    toggle()
    return
  }
  // Esc：只在被遮掩时用于恢复，避免和页面其它交互冲突
  if (event.key === 'Escape' && stealth.covered) {
    event.preventDefault()
    reveal()
  }
}

function onBlur(): void {
  if (!settings.stealthAuto || !usable()) return
  if (!hasInteracted || stealth.covered) return
  // 只遮掩、不提示：切回来时按快捷键恢复
  cover()
}

function onVisibility(): void {
  if (document.hidden) onBlur()
}

function onFirstTouch(): void {
  hasInteracted = true
}

/** 在 App 挂载时调用一次；重复调用会重复绑监听，所以只从 App.vue 里挂。 */
export function installStealth(): void {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('blur', onBlur)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pointerdown', onFirstTouch, { once: true })
  window.addEventListener('keydown', onFirstTouch, { once: true })
}

export function uninstallStealth(): void {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('blur', onBlur)
  document.removeEventListener('visibilitychange', onVisibility)
}
