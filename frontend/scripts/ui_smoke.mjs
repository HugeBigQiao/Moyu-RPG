/**
 * 无头 Edge 跑一遍 SPA：首页双卡 → 背景档案 → 游戏三栏 → 设置 → 档案增删改。
 *   node scripts/ui_smoke.mjs [baseUrl]
 *
 * 档案编辑那一段会在 lore 里建一条 zz_ui_lore 再删掉；中途失败留下的残留，
 * 下次开跑前会先清一次。
 */
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'http://127.0.0.1:8888'
const SHOTS = 'shots'
mkdirSync(SHOTS, { recursive: true })

const errors = []
let pass = 0
let fail = 0

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${detail}`) }
}

// 浏览器通道：默认 Edge（Windows 自带）。Linux 上通常没有 Edge，
// 用 PLAYWRIGHT_CHANNEL=chrome，或 PLAYWRIGHT_EXECUTABLE=/usr/bin/chromium 指定二进制。
const CHANNEL = process.env.PLAYWRIGHT_CHANNEL || 'msedge'
const EXECUTABLE = process.env.PLAYWRIGHT_EXECUTABLE || ''
const browser = await chromium.launch({
  headless: true,
  ...(EXECUTABLE ? { executablePath: EXECUTABLE } : { channel: CHANNEL })
})
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })

page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

async function goto(path) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
}

console.log('1) 首页')
await goto('/')
check('标题', (await page.locator('h1').first().innerText()).includes('玄门诡事录'))
check('两张大卡', (await page.locator('.big-card').count()) === 2)
check('顶栏有设置按钮', await page.getByRole('button', { name: /设置/ }).count() > 0)
await page.screenshot({ path: `${SHOTS}/01-home.png`, fullPage: true })

console.log('2) 设置面板')
await page.getByRole('button', { name: /设置/ }).click()
await page.waitForTimeout(300)
check('设置面板打开', await page.locator('.settings-panel').count() > 0)
check('三套主题 + 三种遮掩', (await page.locator('.theme-card').count()) === 6)
await page.locator('.theme-card.light').click()
await page.waitForTimeout(250)
check('切到浅色', (await page.locator('html').getAttribute('data-theme')) === 'light')
const lightButtonLums = await page.evaluate(() => {
  const parse = (v) => {
    const m = v.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const p = m[1].split(',').map(Number)
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
  }
  const lum = (c) => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255
  const values = []
  for (const el of document.querySelectorAll('button:not(.primary)')) {
    const bg = parse(getComputedStyle(el).backgroundColor)
    if (bg && bg.a > 0.5) values.push(Number(lum(bg).toFixed(3)))
  }
  return values
})
check('浅色下按钮不再发黑', lightButtonLums.length > 0 && lightButtonLums.every(v => v > 0.4),
  JSON.stringify(lightButtonLums))
await page.locator('.theme-card.dark').click()
await page.waitForTimeout(200)
check('切回深色', (await page.locator('html').getAttribute('data-theme')) === 'dark')
await page.getByRole('button', { name: '关闭' }).click()
await page.waitForTimeout(200)
check('面板关闭', (await page.locator('.settings-panel').count()) === 0)

console.log('3) 遮掩')
await page.keyboard.press('Control+Shift+H')
await page.waitForTimeout(300)
check('快捷键遮掩（模糊）', (await page.locator('.stealth-blur').count()) > 0)
check('模糊层有返回按钮', (await page.locator('.stealth-back').count()) > 0)
await page.locator('.stealth-back').click()
await page.waitForTimeout(300)
check('点返回按钮恢复', (await page.locator('.stealth-blur').count()) === 0)

await page.getByRole('button', { name: /设置/ }).click()
await page.waitForTimeout(250)
await page.locator('.theme-card', { hasText: '伪装页' }).click()
await page.getByRole('button', { name: '关闭' }).click()
await page.waitForTimeout(200)
await page.keyboard.press('Control+Shift+H')
await page.waitForTimeout(300)
check('伪装页出现', (await page.locator('.stealth-fake').count()) > 0)
check('伪装页像工作文档', (await page.locator('.stealth-fake').innerText()).includes('订单中心'))
check('伪装页不含游戏词', !(await page.locator('.stealth-fake').innerText()).includes('祟物'))
check('伪装页有返回按钮', (await page.locator('.sf-back').count()) > 0)
await page.screenshot({ path: `${SHOTS}/02-stealth.png`, fullPage: true })
await page.locator('.sf-back').click()
await page.waitForTimeout(250)
check('点返回按钮恢复', (await page.locator('.stealth-fake').count()) === 0)

console.log('4) 背景档案')
await goto('/archive/cities')
check('左侧目录', (await page.locator('.arch-nav a').count()) === 11)
check('城市条目', (await page.locator('.arch-item').count()) >= 10)
check('右侧详情', (await page.locator('.arch-detail .panel').count()) > 0)
const cityTitle = await page.locator('.arch-detail h2').first().innerText()
await page.locator('.arch-item').nth(3).click()
await page.waitForTimeout(250)
check('切换条目', (await page.locator('.arch-detail h2').first().innerText()) !== cityTitle)
await page.screenshot({ path: `${SHOTS}/02-archive.png`, fullPage: true })

console.log('4) 档案 · 教派 / 装备')
await page.locator('.arch-nav a', { hasText: '教派' }).click()
await page.waitForTimeout(600)
check('教派条目', (await page.locator('.arch-item').count()) >= 6)
check('教派详情有宗旨', (await page.locator('.arch-detail').innerText()).includes('宗旨'))
await page.locator('.arch-nav a', { hasText: '装备库' }).click()
await page.waitForTimeout(600)
check('装备条目', (await page.locator('.arch-item').count()) >= 10)

// 详情按类别拆成 11 个组件后，逐类确认渲染没坏（模板搬错会在这里露出来）
console.log('4c) 档案 · 11 类详情')
for (const kind of ['cities', 'figures', 'agencies', 'sects', 'industries', 'nations',
  'lore', 'events', 'missions', 'equipment', 'traits']) {
  await goto(`/archive/${kind}`)
  const text = (await page.locator('.arch-detail').innerText()).trim()
  check(`${kind} 详情非空`, text.length > 10, text.slice(0, 40))
}

console.log('5) 游戏 · 地图')
await goto('/game')
await page.waitForTimeout(800)
check('地图有轮廓', (await page.locator('.china-map .land path').count()) >= 2)
check('城市点', (await page.locator('.city-node').count()) === 10)
check('中间面板有城市', (await page.locator('.panel h2').first().innerText()).length > 0)
await page.screenshot({ path: `${SHOTS}/03-game.png`, fullPage: true })

console.log('6) 游戏 · 切城市与菜单')
const firstName = await page.locator('.panel h2').first().innerText()
await page.locator('.city-node').nth(4).click()
await page.waitForTimeout(700)
check('切城市生效', (await page.locator('.panel h2').first().innerText()) !== firstName)
await page.locator('.menu-btn', { hasText: '人物' }).click()
await page.waitForTimeout(300)
check('人物面板', (await page.locator('.menu-list .menu-row').count()) > 0)
await page.locator('.menu-btn', { hasText: '参与' }).click()
await page.waitForTimeout(300)
check('参与关系表', (await page.locator('table tbody tr').count()) > 0)
await page.locator('.menu-btn', { hasText: '任务' }).click()
await page.waitForTimeout(300)
check('任务面板', (await page.locator('.panel').innerText()).includes('随机任务'))
await page.screenshot({ path: `${SHOTS}/04-game-menu.png`, fullPage: true })

console.log('7) 档案编辑')
const CLEAN_ID = 'zz_ui_lore'
// 上一次跑到一半失败的话，先把残留的测试条目清掉
await fetch(`${BASE}/api/archive/lore/${CLEAN_ID}`, { method: 'DELETE' }).catch(() => {})
await goto('/archive/lore')
const beforeCount = await page.locator('.arch-item').count()
await page.locator('.arch-tools button.primary').click()
await page.waitForTimeout(300)
check('编辑器打开', (await page.locator('.ed-panel').count()) === 1)
await page.locator('.ed-panel input').nth(0).fill(CLEAN_ID)
await page.locator('.ed-panel input').nth(1).fill('界面测试条目')
await page.locator('.ed-panel textarea').first().fill('这条由 UI 冒烟临时创建，跑完会删。')
await page.screenshot({ path: `${SHOTS}/05-editor.png`, fullPage: false })
await page.locator('.ed-foot button.primary').click()
await page.waitForTimeout(1200)
check('新增后条目 +1', (await page.locator('.arch-item').count()) === beforeCount + 1)
check('新增条目被选中', (await page.locator('.arch-detail h2').first().innerText()).includes('界面测试条目'))

await page.locator('.arch-tools button', { hasText: '编辑' }).click()
await page.waitForTimeout(300)
check('编辑时 id 不可改', await page.locator('.ed-panel input').nth(0).isDisabled())
await page.locator('.ed-panel input').nth(1).fill('界面测试条目（改）')
await page.locator('.ed-foot button.primary').click()
await page.waitForTimeout(1200)
check('编辑已生效', (await page.locator('.arch-detail h2').first().innerText()).includes('（改）'))

await page.locator('.arch-tools button.danger').click()
await page.waitForTimeout(200)
check('出现删除确认', (await page.locator('.arch-confirm').count()) === 1)
await page.locator('.arch-confirm button.danger').click()
await page.waitForTimeout(1200)
check('删除后条目还原', (await page.locator('.arch-item').count()) === beforeCount)

console.log('8) 教派关系显示')
await goto('/archive/sects')
const sectText = await page.locator('.arch-detail').innerText()
check('关系显示中文名', sectText.includes('全真：'))
check('不泄露英文 id', !/quanzhen:|zhengyi:/.test(sectText))

console.log('9) console 报错')
check('没有 console error', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()
console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
