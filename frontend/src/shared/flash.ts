/**
 * 轻提示（toast）。
 *
 * 职责：
 *     全站共用的一个提示条：显示一句话，几秒后自动消失。
 * 为什么需要：
 *     保存、删除、开团这些操作的结果只需要一句话，不值得每个页面各写一套。
 * 上下游：
 *     上游：areas/* 与 app/SettingsPanel.vue 调 setFlash；
 *     下游：app/App.vue 里的 .toast 节点。
 */
import { reactive } from 'vue'

export type FlashLevel = 'ok' | 'err'

export interface FlashState {
  msg: string
  level: FlashLevel
}

export const flash = reactive<FlashState>({ msg: '', level: 'ok' })

let timer: ReturnType<typeof setTimeout> | null = null

export function setFlash(msg: string, level: FlashLevel = 'ok'): void {
  flash.msg = msg
  flash.level = level
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    flash.msg = ''
  }, 7000)
}

export function clearFlash(): void {
  flash.msg = ''
}
