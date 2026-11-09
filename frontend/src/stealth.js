/**
 * 遮掩（摸鱼）状态。
 *
 * 三个模式：
 *   off   正常显示
 *   blur  整页虚化，只留一句「已锁」
 *   fake  换成一页看起来像运维文档的假页面
 *
 * 触发方式：
 *   Ctrl+Shift+H 手动切换（任何时候都生效）
 *   页面失焦/切到后台自动遮掩（可在设置里关掉）
 */
import { reactive } from 'vue'
import { settings } from './settings'

export const stealth = reactive({
  covered: false,
  lastMode: 'blur'
})

export const HOTKEY_LABEL = 'Ctrl+Shift+H'

// 用户还没碰过页面时不自动遮掩：避免刚打开、窗口还没聚焦就被盖住
let hasInteracted = false

function usable() {
  return settings.stealthMode && settings.stealthMode !== 'off'
}

export function cover() {
  if (!usable()) return
  stealth.lastMode = settings.stealthMode
  stealth.covered = true
}

export function reveal() {
  stealth.covered = false
}

export function toggle() {
  if (stealth.covered) reveal()
  else cover()
}

function onKeydown(event) {
  // Ctrl+Shift+H：遮掩/恢复
  if (event.ctrlKey && event.shiftKey && (event.key === 'H' || event.key === 'h')) {
    event.preventDefault()
    if (!usable()) return
    toggle()
    return
  }
  // Esc：只有在被遮掩时才用于恢复，避免和页面其他交互冲突
  if (event.key === 'Escape' && stealth.covered) {
    event.preventDefault()
    reveal()
  }
}

function onBlur() {
  if (!settings.stealthAuto || !usable()) return
  if (!hasInteracted || stealth.covered) return
  // 只遮掩、不显示任何提示，切回来时按快捷键恢复
  cover()
}

function onVisibility() {
  if (document.hidden) onBlur()
}

function onFirstTouch() {
  hasInteracted = true
}

export function installStealth() {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('blur', onBlur)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pointerdown', onFirstTouch, { once: true })
  window.addEventListener('keydown', onFirstTouch, { once: true })
}

export function uninstallStealth() {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('blur', onBlur)
  document.removeEventListener('visibilitychange', onVisibility)
}
