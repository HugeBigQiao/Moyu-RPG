import { reactive } from 'vue'

export const flash = reactive({ msg: '', level: 'ok' })

let timer = null

export function setFlash(msg, level = 'ok') {
  flash.msg = msg
  flash.level = level
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { flash.msg = '' }, 7000)
}

export function clearFlash() {
  flash.msg = ''
}
