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

export const api = {
  dashboard: () => req('/dashboard'),
  roster: () => req('/roster'),
  world: () => req('/world'),
  events: () => req('/events'),
  missions: () => req('/missions'),
  character: (id) => req(`/characters/${id}`),
  rollAttrs: () => req('/characters/roll', { method: 'POST' }),
  randomMissions: (city, count = 3) =>
    req(`/missions/random?city=${encodeURIComponent(city)}&count=${count}`),
  startRandom: (characterId, city) =>
    req('/sessions/random', {
      method: 'POST',
      body: JSON.stringify({ character_id: characterId, city: city || null })
    }),
  createPlayer: (payload) => req('/characters', { method: 'POST', body: JSON.stringify(payload) }),
  npcs: (count, city) =>
    req('/npcs', { method: 'POST', body: JSON.stringify({ count, city: city || null }) }),
  promote: (id) => req(`/characters/${id}/promote`, { method: 'POST' }),
  trial: (id) => req(`/characters/${id}/trial`, { method: 'POST' }),
  buy: (id, itemId) =>
    req(`/characters/${id}/buy`, { method: 'POST', body: JSON.stringify({ item_id: itemId }) }),
  remove: (id) => req(`/characters/${id}`, { method: 'DELETE' }),
  gacha: (count) => req('/gacha', { method: 'POST', body: JSON.stringify({ count }) }),
  scenarios: () => req('/scenarios'),
  startSession: (characterId, scenarioId) =>
    req('/sessions', {
      method: 'POST',
      body: JSON.stringify({ character_id: characterId, scenario_id: scenarioId })
    }),
  session: (id) => req(`/sessions/${id}`),
  act: (id, action) =>
    req(`/sessions/${id}/act`, { method: 'POST', body: JSON.stringify({ action }) })
}
