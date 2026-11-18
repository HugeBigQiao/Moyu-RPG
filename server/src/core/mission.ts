/**
 * 随机任务生成。
 *
 * 职责：
 *     城市 + 事件 + 祟物 → 场景流；任务 id 里带种子，可复现。
 * 为什么需要：
 *     固定剧本数量有限，随机任务让「每一城都有新案子」。
 * 上下游：
 *     上游：content/{world,events,bestiary,missions}；下游：api/sessions、api/game。
 */
import { createHash } from 'node:crypto'
import type { GameContent } from '../content/index.ts'
import { eventPool, type EventItem } from '../content/events.ts'
import { difficultyOf, gradeLabel, rewardOf } from '../content/missions.ts'
import { tierRank, type City } from '../content/world.ts'
import { Roller, newSeed } from './dice.ts'

const PREFIX = 'gen'

function hash(seed: string): string {
  return createHash('md5').update(seed, 'utf8').digest('hex').slice(0, 8)
}

function missionId(cityId: string, key: string): string {
  return `${PREFIX}-${cityId}-${key}`
}

/** 按难度挑一只体量合适的祟物。 */
function monsterFor(roller: Roller, content: GameContent, budget: number) {
  let pool = content.bestiary.bestiary.filter((monster) => Math.abs(Number(monster.hp) - budget) <= 28)
  if (!pool.length) pool = [...content.bestiary.bestiary]
  return roller.choice(pool, '祟物')
}

function investigateScene(event: EventItem, index: number, city: City) {
  const landmarks = city.landmarks?.length ? city.landmarks : ['现场']
  return {
    id: `s${index + 1}`,
    kind: 'investigate',
    name: `现场勘查：${event.name}`,
    place: `${city.name} · ${landmarks[index % landmarks.length]}`,
    text: `${event.text} ${event.hook}`,
    options: [
      {
        id: `e${index}_a`,
        label: `顺着「${event.name}」这条线查下去`,
        skill: 'investigate',
        success: '你摸到了这条线的来处：它和这座城市某件旧事扣在一起，扣得很紧。',
        fail: '线索断在半路。你只带回来一肚子疑问，和一点阴浊。',
        clue: `${event.name}：来处查到一半`,
      },
      {
        id: `e${index}_b`,
        label: '找当地人问一问这件事',
        skill: 'persuade',
        success: '有人愿意说了。说法和卷宗里的不一样，但更可信。',
        fail: '对方摆手，说「别问，问了要出事」。',
        clue: `${event.name}：本地人知情但不敢说`,
      },
      {
        id: `e${index}_c`,
        label: '闭眼，摸这地方的五行',
        skill: 'wuxing',
        success: '五行在这里是拧着的——有东西在这里停了很久，一直没走。',
        fail: '你只感到一阵说不上来的疲惫。',
        clue: `${event.name}：此地五行拧着`,
      },
    ],
    next: `s${index + 2}`,
  }
}

export interface GeneratedMission {
  id: string
  name: string
  code: string
  kind: 'random'
  city: string
  city_name: string
  tier: string
  difficulty: number
  grade: string
  reward: number
  events: string[]
  event_names: string[]
  monster: { id: string; name: string; hp: number }
  seed: string
  brief: string
  scenario: {
    id: string
    name: string
    code: string
    brief: string
    place: string
    start_corruption: number
    scenes: any[]
    endings: Record<string, string>
  }
}

/** 生成一个随机任务。key 就是随机种子；给了 key 就一定得到同一个任务。 */
export function generate(content: GameContent, cityId: string, key?: string): GeneratedMission {
  key = key ?? hash(newSeed())
  const roller = new Roller(`${cityId}|${key}`)
  const city = content.world.cityById.get(cityId) ?? content.world.cityById.get('nanyu')!

  const rank = tierRank(content.world, city.tier)
  const want = rank <= 1 ? 3 : 2
  const chosen = pick(roller, content, city, want)

  const monster = monsterFor(roller, content, 30 + rank * 6)
  const difficulty = difficultyOf(chosen, Number(monster.hp), city.tier)
  const reward = rewardOf(difficulty)

  const scenes: any[] = chosen.map((event, index) => investigateScene(event, index, city))
  scenes.push({
    id: `s${scenes.length + 1}`,
    kind: 'combat',
    name: `遭遇：${monster.name}`,
    place: `${city.name} · ${city.landmarks?.length ? city.landmarks[city.landmarks.length - 1] : '深处'}`,
    text: `线头都指向同一个地方。你们在那里撞上了它——${monster.lore}。`,
    enemy: monster.id,
    next: `s${scenes.length + 2}`,
  })

  const top = chosen[0]?.name ?? '无名事件'
  scenes.push({
    id: `s${scenes.length + 1}`,
    kind: 'choice',
    name: `抉择：${top}的尾巴`,
    place: `${city.name} · 收尾`,
    text: `它散了。可这件事的根还在：${chosen.length ? chosen[chosen.length - 1].hook : '有些人的账还没算'}。你知道接下来怎么做，会决定这座城市往后十年长什么样。`,
    choices: [
      {
        id: 'purify', label: '把因果了结，该超度的超度',
        text: '你把该办的仪式办完，把该说的话说完。事情到此为止，这座城市少了一桩旧账。',
        merit: 7, corruption: -5, karma: '善',
      },
      {
        id: 'burn', label: '断根。该烧的烧，该拆的拆',
        text: '你处理得很干净，干净到没有人再提起。代价是这座城市又少了一点什么。',
        merit: -3, corruption: 3, karma: '阴债',
      },
      {
        id: 'seal', label: '先封起来，等上面批',
        text: '你贴上封条，写了一份谁都不会细看的报告。事情变成了「待处理」。',
        merit: 1, corruption: 1, karma: '灰色',
      },
    ],
    next: 'done',
  })

  const name = `${city.name} · ${chosen[0]?.name ?? '无题'}`
  return {
    id: missionId(city.id, key),
    name,
    code: `RND-${key.toUpperCase().slice(0, 4)}`,
    kind: 'random',
    city: city.id,
    city_name: city.name,
    tier: city.tier,
    difficulty,
    grade: gradeLabel(difficulty),
    reward,
    events: chosen.map((event) => event.id),
    event_names: chosen.map((event) => event.name),
    monster: { id: monster.id, name: monster.name, hp: monster.hp },
    seed: key,
    brief: `由「${name}」拼出来的一桩随机案子。`,
    scenario: {
      id: missionId(city.id, key),
      name,
      code: `RND-${key.toUpperCase().slice(0, 4)}`,
      brief: '随机生成',
      place: city.name,
      start_corruption: 8 + rank * 3,
      scenes,
      endings: {
        good: '案子了了。这座城市照常运转，只是少了一桩旧账。',
        neutral: '案子结了，档案归档。你在报告里写「已处置」。',
        bad: '案子结了，但根没断。它会在别的地方，换一个名字再长出来。',
      },
    },
  }
}

function pick(roller: Roller, content: GameContent, city: City, want: number) {
  let pool = eventPool(content.events, content.world, city, null)
  const chosen: EventItem[] = []
  while (pool.length && chosen.length < want) {
    const event = roller.weighted(pool, '任务事件')
    chosen.push(event)
    pool = pool.filter(([item]) => item.id !== event.id)
  }
  return chosen
}

/** 给「任务库」页看的样例，不落库、不开团。 */
export function preview(content: GameContent, cityId: string, count = 3) {
  const out = []
  for (let i = 0; i < Math.max(1, Math.min(10, count)); i++) {
    const mission = generate(content, cityId)
    out.push({
      id: mission.id,
      name: mission.name,
      code: mission.code,
      city_name: mission.city_name,
      difficulty: mission.difficulty,
      grade: mission.grade,
      reward: mission.reward,
      event_names: mission.event_names,
      monster: mission.monster,
      scenes: mission.scenario.scenes.length,
    })
  }
  return out
}
