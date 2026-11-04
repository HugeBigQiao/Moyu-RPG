/**
 * 用系统 Edge 无头跑一遍 SPA，确认 Vue 真的渲染、没白屏、没 console 报错。
 *   node scripts/ui_smoke.mjs [baseUrl]
 */
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'http://127.0.0.1:8770'
const SHOTS = 'shots'
mkdirSync(SHOTS, { recursive: true })

const errors = []
let pass = 0
let fail = 0

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })

page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

async function goto(path) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(350)
}

console.log('1) 总览')
await goto('/')
check('标题渲染', (await page.locator('h1').first().innerText()).includes('集群总览'))
check('侧栏六项', (await page.locator('.side nav a').count()) === 6)
check('KPI 有数字', (await page.locator('.kpi .value').count()) >= 4)
await page.screenshot({ path: `${SHOTS}/01-dashboard.png`, fullPage: true })

console.log('2) 人员档案 + 随机生成')
await goto('/roster')
check('列表渲染', (await page.locator('tbody tr').count()) > 0)
const before = await page.locator('tbody tr').count()
await page.getByRole('button', { name: '随机 1 人' }).click()
await page.waitForTimeout(1100)
const after = await page.locator('tbody tr').count()
check('随机生成 +1 人', after === before + 1, `${before} -> ${after}`)
check('出现提示条', (await page.locator('.toast').count()) > 0)
check('有难度列', (await page.locator('th').allInnerTexts()).some(t => t.includes('难度')))
const charUrl = await page.locator('tbody tr').first().locator('a').first().getAttribute('href')
check('能取到角色链接', Boolean(charUrl), String(charUrl))
await page.screenshot({ path: `${SHOTS}/02-roster.png`, fullPage: true })

console.log('3) 世界档案')
await goto('/world')
check('城市分级', await page.getByText('特级城市').count() > 0)
check('城市表', (await page.locator('tbody tr').count()) > 5)
await page.getByRole('button', { name: '教派' }).click()
await page.waitForTimeout(250)
check('教派页签', await page.getByText('正一').count() > 0)
await page.screenshot({ path: `${SHOTS}/03-world.png`, fullPage: true })

console.log('4) 事件库')
await goto('/events')
check('事件分组', (await page.locator('.panel').count()) >= 4)
check('有甲级事件', (await page.locator('h2').allInnerTexts()).some(t => t.includes('甲等')))
check('事件总数 50', (await page.locator('tbody tr').count()) === 50)
await page.screenshot({ path: `${SHOTS}/04-events.png`, fullPage: true })

console.log('5) 任务库')
await goto('/missions')
check('固定任务表', (await page.locator('tbody tr').count()) >= 5)
check('随机任务样例', (await page.locator('.chip.accent').count()) > 0)
await page.screenshot({ path: `${SHOTS}/05-missions.png`, fullPage: true })

console.log('6) 角色详情 + 随机任务')
await goto(charUrl)
check('健康指标', (await page.locator('.attr').count()) === 6)
check('出身面板', await page.getByText('出身事件').count() > 0)
check('随机任务按钮', await page.getByRole('button', { name: '随机任务' }).count() > 0)
await page.screenshot({ path: `${SHOTS}/06-character.png`, fullPage: true })

console.log('7) 新建角色表单')
await goto('/create')
const panels = (await page.locator('.panel').allInnerTexts()).join(' ')
check('表单渲染', panels.includes('属性掷点'))
check('掷点合计 72', panels.includes('/72'))
check('有重掷按钮', await page.getByRole('button', { name: '重掷' }).count() > 0)
await page.screenshot({ path: `${SHOTS}/07-create.png`, fullPage: true })

console.log('8) 开团 + 打一回合')
await goto(charUrl)
await page.getByRole('button', { name: /开团：/ }).first().click()
await page.waitForURL(/\/play\/\d+/, { timeout: 8000 })
await page.waitForTimeout(500)
check('处置台渲染', (await page.locator('.scene .name').count()) > 0)
const acts = page.locator('.act:not([disabled])')
check('有可用操作', (await acts.count()) > 0)
await acts.first().click()
await page.waitForTimeout(900)
check('事件流增长', (await page.locator('.ev').count()) > 1)
await page.screenshot({ path: `${SHOTS}/08-play.png`, fullPage: true })

console.log('9) console 报错')
check('没有 console error', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()
console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
