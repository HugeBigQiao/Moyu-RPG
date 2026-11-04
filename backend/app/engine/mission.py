"""随机任务生成器。

「任务也是随机的」——不是写死剧本，而是把
    城市 + 2~3 条事件 + 一只祟物
现场拼成一场「勘查 → 勘查 → 遭遇 → 抉择」。

生成是确定性的：同一个 seed 一定得到同一个任务，所以任务 id 里带着种子，
存档/回放/重进都不用落库。
"""

from __future__ import annotations

import hashlib

from ..content import bestiary, events as events_mod, missions as missions_mod, world
from .dice import Roller, new_seed

PREFIX = "gen"


def _hash(seed: str) -> str:
    return hashlib.md5(seed.encode("utf-8")).hexdigest()[:8]


def mission_id(city_id: str, key: str) -> str:
    return "%s-%s-%s" % (PREFIX, city_id, key)


def parse_id(value: str) -> tuple[str, str] | None:
    """gen-<city>-<key> -> (city_id, key)。key 就是随机种子本身。"""
    if not value or not value.startswith(PREFIX + "-"):
        return None
    parts = value.split("-")
    if len(parts) < 3:
        return None
    city_id = parts[1]
    if city_id not in world.CITY_BY_ID:
        return None
    return city_id, parts[2]


def _monster_for(roller: Roller, city: dict, budget: int) -> dict:
    """按难度挑一只体量合适的祟物。"""
    pool = [m for m in bestiary.BESTIARY if abs(m["hp"] - budget) <= 28]
    if not pool:
        pool = list(bestiary.BESTIARY)
    return roller.choice(pool, "祟物")


def _investigate_scene(roller: Roller, event: dict, index: int, city: dict) -> dict:
    return {
        "id": "s%d" % (index + 1),
        "kind": "investigate",
        "name": "现场勘查：%s" % event["name"],
        "place": "%s · %s" % (city["name"], (city.get("landmarks") or ["现场"])[index % len(city.get("landmarks") or ["现场"])]),
        "text": event["text"] + " " + event["hook"],
        "options": [
            {
                "id": "e%d_a" % index,
                "label": "顺着「%s」这条线查下去" % event["name"],
                "skill": "investigate",
                "success": "你摸到了这条线的来处：它和这座城市某件旧事扣在一起，扣得很紧。",
                "fail": "线索断在半路。你只带回来一肚子疑问，和一点阴浊。",
                "clue": "%s：来处查到一半" % event["name"],
            },
            {
                "id": "e%d_b" % index,
                "label": "找当地人问一问这件事",
                "skill": "persuade",
                "success": "有人愿意说了。说法和卷宗里的不一样，但更可信。",
                "fail": "对方摆手，说「别问，问了要出事」。",
                "clue": "%s：本地人知情但不敢说" % event["name"],
            },
            {
                "id": "e%d_c" % index,
                "label": "闭眼，摸这地方的五行",
                "skill": "wuxing",
                "success": "五行在这里是拧着的——有东西在这里停了很久，一直没走。",
                "fail": "你只感到一阵说不上来的疲惫。",
                "clue": "%s：此地五行拧着" % event["name"],
            },
        ],
        "next": "s%d" % (index + 2),
    }


def generate(city_id: str, key: str | None = None) -> dict:
    """生成一个随机任务。key 就是随机种子；给了 key 就一定得到同一个任务。"""
    if key is None:
        key = _hash(new_seed())
    roller = Roller(seed="%s|%s" % (city_id, key))
    city = world.CITY_BY_ID.get(city_id) or world.CITY_BY_ID["nanyu"]

    rank = world.tier_rank(city["tier"])
    want = 3 if rank <= 1 else 2
    chosen = _pick(roller, city, want)

    monster = _monster_for(roller, city, budget=30 + rank * 6)
    difficulty = missions_mod.difficulty_of(chosen, monster["hp"], city["tier"])
    reward = missions_mod.reward_of(difficulty)

    scenes = []
    for i, event in enumerate(chosen):
        scenes.append(_investigate_scene(roller, event, i, city))

    scenes.append({
        "id": "s%d" % (len(scenes) + 1),
        "kind": "combat",
        "name": "遭遇：%s" % monster["name"],
        "place": "%s · %s" % (city["name"], (city.get("landmarks") or ["深处"])[-1]),
        "text": "线头都指向同一个地方。你们在那里撞上了它——%s。" % monster["lore"],
        "enemy": monster["id"],
        "next": "s%d" % (len(scenes) + 2),
    })

    top = chosen[0]["name"] if chosen else "无名事件"
    scenes.append({
        "id": "s%d" % (len(scenes) + 1),
        "kind": "choice",
        "name": "抉择：%s的尾巴" % top,
        "place": "%s · 收尾" % city["name"],
        "text": "它散了。可这件事的根还在：%s。你知道接下来怎么做，会决定这座城市往后十年长什么样。"
                % (chosen[-1]["hook"] if chosen else "有些人的账还没算"),
        "choices": [
            {
                "id": "purify",
                "label": "把因果了结，该超度的超度",
                "text": "你把该办的仪式办完，把该说的话说完。事情到此为止，这座城市少了一桩旧账。",
                "merit": 7,
                "corruption": -5,
                "karma": "善",
            },
            {
                "id": "burn",
                "label": "断根。该烧的烧，该拆的拆",
                "text": "你处理得很干净，干净到没有人再提起。代价是这座城市又少了一点什么。",
                "merit": -3,
                "corruption": 3,
                "karma": "阴债",
            },
            {
                "id": "seal",
                "label": "先封起来，等上面批",
                "text": "你贴上封条，写了一份谁都不会细看的报告。事情变成了「待处理」。",
                "merit": 1,
                "corruption": 1,
                "karma": "灰色",
            },
        ],
        "next": "done",
    })

    name = "%s · %s" % (city["name"], chosen[0]["name"] if chosen else "无题")
    return {
        "id": mission_id(city["id"], key),
        "name": name,
        "code": "RND-%s" % key.upper()[:4],
        "kind": "random",
        "city": city["id"],
        "city_name": city["name"],
        "tier": city["tier"],
        "difficulty": difficulty,
        "grade": missions_mod.grade_label(difficulty),
        "reward": reward,
        "events": [e["id"] for e in chosen],
        "event_names": [e["name"] for e in chosen],
        "monster": {"id": monster["id"], "name": monster["name"], "hp": monster["hp"]},
        "seed": key,
        "brief": "由「%s」拼出来的一桩随机案子。" % name,
        "scenario": {
            "id": mission_id(city["id"], key),
            "name": name,
            "code": "RND-%s" % key.upper()[:4],
            "brief": "随机生成",
            "place": city["name"],
            "start_corruption": 8 + rank * 3,
            "scenes": scenes,
            "endings": {
                "good": "案子了了。这座城市照常运转，只是少了一桩旧账。",
                "neutral": "案子结了，档案归档。你在报告里写「已处置」。",
                "bad": "案子结了，但根没断。它会在别的地方，换一个名字再长出来。",
            },
        },
    }


def _pick(roller: Roller, city: dict, want: int) -> list[dict]:
    pool = events_mod.pool(city, None)
    chosen: list[dict] = []
    while pool and len(chosen) < want:
        event = roller.weighted(pool, "任务事件")
        chosen.append(event)
        pool = [(e, w) for e, w in pool if e["id"] != event["id"]]
    return chosen


def preview(city_id: str, count: int = 3) -> list[dict]:
    """给「任务库」页看的样例，不落库、不开团。"""
    out = []
    for i in range(max(1, min(10, count))):
        mission = generate(city_id)
        out.append({
            "id": mission["id"],
            "name": mission["name"],
            "code": mission["code"],
            "city_name": mission["city_name"],
            "difficulty": mission["difficulty"],
            "grade": mission["grade"],
            "reward": mission["reward"],
            "event_names": mission["event_names"],
            "monster": mission["monster"],
            "scenes": len(mission["scenario"]["scenes"]),
        })
    return out
