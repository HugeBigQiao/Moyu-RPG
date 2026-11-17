/**
 * HTTP 冒烟：对一个已经跑起来的服务打一局完整的，顺便验世界层/成长线/档案编辑。
 *
 *   node scripts/api-smoke.ts [baseUrl]
 *
 * 与旧 Python 版保持同一组断言（28 项）；不依赖测试框架，适合部署后手工验。
 */

const BASE = process.argv[2] || 'http://127.0.0.1:8888'
const PRIORITY: Record<string, number> = {
  attack: 0, talisman: 1, summon: 2, check: 3, choice: 3, env: 4, ward: 5,
}

let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    pass++
    console.log(`  ok   ${name}`)
  } else {
    fail++
    console.log(`  FAIL ${name} ${detail}`)
  }
}

async function req(path: string, init?: RequestInit) {
  const response = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const text = await response.text()
  let data: any = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { status: response.status, data, text }
}

async function main(): Promise<number> {
  console.log(`目标：${BASE}`)

  console.log('1) 前端与接口')
  const index = await req('/')
  check('GET / 返回 SPA', index.status === 200 && index.text.includes('<div id="app">'))
  const dashboard = await req('/api/dashboard')
  check('GET /api/dashboard', dashboard.status === 200 && 'totals' in dashboard.data)

  console.log('2) 世界层')
  const world = (await req('/api/world')).data
  check('国家/教派/机构/人物齐备', ['nations', 'sects', 'agencies', 'figures'].every((key) => world[key]?.length))
  check('城市分级 5 档', world.tiers.length === 5)
  check('特级事件上限 10', world.tiers[0].max_events === 10)
  const events = (await req('/api/events')).data
  check('事件库非空', events.events.length > 10)
  check('事件有等级', events.events.every((item: any) => [1, 2, 3, 4].includes(item.grade)))
  const missions = (await req('/api/missions')).data
  check('任务库非空', missions.missions.length >= 5)

  console.log('3) 随机人物')
  const npcs = (await req('/api/npcs', { method: 'POST', body: JSON.stringify({ count: 3, city: 'linjing' }) })).data
  check('生成 3 人', npcs.created === 3)
  check('带出身事件', npcs.people[0].events.length >= 1)
  check('有难度与报酬', npcs.people[0].difficulty >= 1 && npcs.people[0].reward >= 5)
  check('事件数不超过特级上限', npcs.people.every((item: any) => item.events.length <= 10))

  const small = (await req('/api/npcs', { method: 'POST', body: JSON.stringify({ count: 3, city: 'banqiao' }) })).data
  check('四级城市最多 2 条事件', small.people.every((item: any) => item.events.length <= 2))

  console.log('4) 玩家自建')
  const payload = {
    name: '沈砚', school: 'fulu', element: '火', city: 'nanyu',
    attrs: { str: 12, agi: 12, con: 12, int: 12, wil: 12, per: 12 },
    events: [], notes: '自建测试',
  }
  const made = await req('/api/characters', { method: 'POST', body: JSON.stringify(payload) })
  check('建档成功', made.status === 200, made.text.slice(0, 150))
  const cid = made.data.id

  const bad = { ...payload, attrs: { ...payload.attrs, str: 18 } }
  check('点数不对要被拒', (await req('/api/characters', { method: 'POST', body: JSON.stringify(bad) })).status === 400)

  console.log('5) 角色卡')
  const sheet = (await req(`/api/characters/${cid}`)).data
  check('六维属性', sheet.attrs.length === 6)
  check('出身城市', sheet.city.id === 'nanyu')
  check('商店货架', sheet.shelf.length > 0)

  console.log('6) 开团打一局')
  const started = await req('/api/sessions', {
    method: 'POST', body: JSON.stringify({ character_id: cid, scenario_id: 'mirror' }),
  })
  check('开团', started.status === 200, started.text.slice(0, 120))
  const sid = started.data.id

  let rounds = 0
  while (rounds < 120) {
    rounds++
    const state = (await req(`/api/sessions/${sid}`)).data
    if (state.status !== 'active') break
    const usable = state.view.actions.filter((item: any) => item.enabled)
    if (!usable.length) {
      check('还有可用操作', false, `卡在第 ${rounds} 轮`)
      break
    }
    usable.sort((a: any, b: any) => (PRIORITY[a.kind] ?? 9) - (PRIORITY[b.kind] ?? 9))
    const acted = await req(`/api/sessions/${sid}/act`, {
      method: 'POST', body: JSON.stringify({ action: usable[0].id }),
    })
    if (acted.status !== 200) {
      check('行动返回 200', false, acted.text.slice(0, 200))
      break
    }
  }
  const final = (await req(`/api/sessions/${sid}`)).data
  check('一局结束', final.status === 'done', `rounds=${rounds}`)
  check('有结局', Boolean(final.view?.ending))

  console.log('7) 成长线')
  const buy = await req(`/api/characters/${cid}/buy`, { method: 'POST', body: JSON.stringify({ item_id: 'dingshen_dan' }) })
  check('兑换接口有明确回应', buy.status === 200 || buy.status === 400, buy.text.slice(0, 80))
  check('心魔试炼可执行', (await req(`/api/characters/${cid}/trial`, { method: 'POST' })).status === 200)
  const promote = await req(`/api/characters/${cid}/promote`, { method: 'POST' })
  check('晋升接口有明确回应', promote.status === 200 || promote.status === 400)

  console.log('8) 档案编辑')
  const kinds = (await req('/api/archive/kinds')).data.kinds
  check('11 类档案都能编辑', kinds.length === 11)
  const badId = await req('/api/archive/lore', {
    method: 'POST', body: JSON.stringify({ item: { id: 'Bad ID', title: 'x' } }),
  })
  check('坏 id 要被拒', badId.status === 400, badId.text.slice(0, 80))
  const usedCity = await req('/api/archive/cities/nanyu', { method: 'DELETE' })
  check('被引用的城市删不掉', usedCity.status === 400 && usedCity.text.includes('任务'), usedCity.text.slice(0, 120))
  const usedTrait = await req('/api/archive/traits/天眼', { method: 'DELETE' })
  check('被引用的特性删不掉', usedTrait.status === 400 && usedTrait.text.includes('事件'), usedTrait.text.slice(0, 120))

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
  return fail === 0 ? 0 : 1
}

main().then((code) => process.exit(code)).catch((error) => {
  console.error(error)
  process.exit(1)
})
