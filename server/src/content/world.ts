/**
 * 世界层索引。
 *
 * 职责：
 *     把 world.json 拆成数组 + id 索引，并提供城市等级、坐标、势力等查询。
 * 为什么需要：
 *     事件、任务、人物、地图都引用同一份世界数据；索引只建一次。
 * 上下游：
 *     上游：world.json；下游：events、missions、npc、mission、api。
 */

export interface Nation {
  id: string
  name: string
  era?: string
  gov?: string
  blurb?: string
  stance?: string
  [key: string]: any
}

export interface Sect {
  id: string
  name: string
  tradition?: string
  doctrine?: string
  resource?: string
  blurb?: string
  relations?: Record<string, string>
  [key: string]: any
}

export interface Agency {
  id: string
  name: string
  mandate?: string
  authority?: string
  blurb?: string
  relation?: string
  [key: string]: any
}

export interface Figure {
  id: string
  name: string
  title?: string
  org?: string
  element?: string
  blurb?: string
  hook?: string
  [key: string]: any
}

export interface Industry {
  id: string
  name: string
  scale?: number
  risk?: number
  blurb?: string
  [key: string]: any
}

export interface CityTier {
  key: string
  name: string
  pop?: string
  max_events: number
  blurb?: string
  [key: string]: any
}

export interface City {
  id: string
  name: string
  tier: string
  nation: string
  pop: number
  industries: string[]
  landmarks: string[]
  blurb?: string
  missions?: string[]
  [key: string]: any
}

export interface Faction {
  name: string
  kind?: string
  note?: string
  [key: string]: any
}

export interface Lore {
  id: string
  title: string
  body: string
  [key: string]: any
}

export interface WorldDoc {
  nations: Nation[]
  sects: Sect[]
  agencies: Agency[]
  figures: Figure[]
  industries: Industry[]
  tiers: CityTier[]
  cities: City[]
  city_geo?: Record<string, [number, number]>
  city_factions?: Record<string, Faction[]>
  lore?: Lore[]
}

export interface WorldIndex extends WorldDoc {
  nationById: Map<string, Nation>
  sectById: Map<string, Sect>
  agencyById: Map<string, Agency>
  figureById: Map<string, Figure>
  industryById: Map<string, Industry>
  cityById: Map<string, City>
  tierByKey: Map<string, CityTier>
  cityGeo: Record<string, [number, number]>
  cityFactions: Record<string, Faction[]>
  lore: Lore[]
}

export function indexWorld(doc: WorldDoc): WorldIndex {
  const cities = doc.cities ?? []
  return {
    ...doc,
    nations: doc.nations ?? [],
    sects: doc.sects ?? [],
    agencies: doc.agencies ?? [],
    figures: doc.figures ?? [],
    industries: doc.industries ?? [],
    tiers: doc.tiers ?? [],
    cities,
    cityGeo: doc.city_geo ?? {},
    cityFactions: doc.city_factions ?? {},
    lore: doc.lore ?? [],
    nationById: new Map((doc.nations ?? []).map((item) => [item.id, item])),
    sectById: new Map((doc.sects ?? []).map((item) => [item.id, item])),
    agencyById: new Map((doc.agencies ?? []).map((item) => [item.id, item])),
    figureById: new Map((doc.figures ?? []).map((item) => [item.id, item])),
    industryById: new Map((doc.industries ?? []).map((item) => [item.id, item])),
    cityById: new Map(cities.map((item) => [item.id, item])),
    tierByKey: new Map((doc.tiers ?? []).map((item) => [item.key, item])),
  }
}

/** 越小越大。 */
export function tierRank(world: WorldIndex, key: string): number {
  const index = world.tiers.findIndex((tier) => tier.key === key)
  return index < 0 ? world.tiers.length - 1 : index
}

export function citiesByTier(world: WorldIndex, tier: string): City[] {
  return world.cities.filter((city) => city.tier === tier)
}

export function maxEvents(world: WorldIndex, cityId: string): number {
  const city = world.cityById.get(cityId)
  if (!city) return 2
  return Number(world.tierByKey.get(city.tier)?.max_events ?? 2)
}

export function industryName(world: WorldIndex, industryId: string): string {
  return world.industryById.get(industryId)?.name ?? industryId
}

export function geoOf(world: WorldIndex, cityId: string): [number, number] {
  const point = world.cityGeo[cityId] ?? [35.0, 105.0]
  return [Number(point[0]), Number(point[1])]
}

export function factionsOf(world: WorldIndex, cityId: string): Faction[] {
  return world.cityFactions[cityId] ?? []
}
