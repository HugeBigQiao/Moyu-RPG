const BASE = '/api'

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = { detail: text } }
  if (!res.ok) {
    throw new Error((data && (data.detail || data.message)) || `HTTP ${res.status}`)
  }
  return data
}

const post = (path, body) =>
  req(path, { method: 'POST', body: JSON.stringify(body || {}) })

export const api = {
  // 档案
  world: () => req('/world'),
  events: () => req('/events'),
  missions: () => req('/missions'),
  equipment: () => req('/equipment'),
  traits: () => req('/traits'),

  // 人物
  roster: () => req('/roster'),
  character: (id) => req(`/characters/${id}`),
  rollAttrs: () => post('/characters/roll'),
  createPlayer: (payload) => post('/characters', payload),
  npcs: (count, city) => post('/npcs', { count, city: city || null }),
  promote: (id) => post(`/characters/${id}/promote`),
  trial: (id) => post(`/characters/${id}/trial`),
  buy: (id, itemId) => post(`/characters/${id}/buy`, { item_id: itemId }),
  remove: (id) => req(`/characters/${id}`, { method: 'DELETE' }),

  // 游戏
  gameMap: () => req('/game/map'),
  gameCity: (id) => req(`/game/city/${id}`),
  startSession: (characterId, scenarioId) =>
    post('/sessions', { character_id: characterId, scenario_id: scenarioId }),
  startRandom: (characterId, city) =>
    post('/sessions/random', { character_id: characterId, city: city || null }),
  session: (id) => req(`/sessions/${id}`),
  act: (id, action) => post(`/sessions/${id}/act`, { action })
}
