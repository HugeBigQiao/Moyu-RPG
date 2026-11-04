"""人物生成：玩家自建 + 系统随机（NPC）。

规则（按需求）：
  · 随机人物 = 随机城市 + 随机事件串
  · 事件数量上限由城市等级决定（特级最多 10 个，四级最多 2 个）
  · 事件等级越高越稀罕，也越少被通用
  · 难度与奖励从事件强度推出来
  · 玩家自建角色走点数分配，事件自选
"""

from __future__ import annotations

import hashlib

from ..content import events as events_mod
from ..content import missions as missions_mod
from ..content import traits as traits_mod
from ..content import world
from . import gacha, sheet
from .dice import Roller, new_seed, roll4d6_drop_lowest

ATTR_KEYS = ("str", "agi", "con", "int", "wil", "per")
ATTR_MIN, ATTR_MAX = 6, 18
PLAYER_POINTS = 72

TIER_ATTR_BONUS = {"t0": 3, "t1": 2, "t2": 1, "t3": 0, "t4": -1}

RANK_BY_RARITY = {"凡": "初真", "灵": "盟威", "玄": "五雷", "天": "天师"}
RARITY_BY_GRADE = {1: "天", 2: "玄", 3: "灵", 4: "凡"}


def _code(seed: str) -> str:
    return "nd-%s" % hashlib.md5(seed.encode("utf-8")).hexdigest()[:6]


def pick_city(roller: Roller, allowed: list[str] | None = None) -> dict:
    """按人口加权抽城市：越大的城市越容易出人。"""
    cities = world.CITIES
    if allowed:
        cities = [c for c in cities if c["id"] in allowed] or world.CITIES
    pairs = [(c, float(c.get("pop", 100))) for c in cities]
    return roller.weighted(pairs, "出生城市")


def pick_events(roller: Roller, city: dict, mission_id: str | None, want: int,
                allowed_ids: list[str] | None = None,
                background: bool = False) -> list[dict]:
    """从可用事件池里不重复地抽 want 条。"""
    pool = events_mod.pool(city, mission_id, background=background)
    if allowed_ids:
        pool = [(e, w) for e, w in pool if e["id"] in allowed_ids]
    chosen: list[dict] = []
    while pool and len(chosen) < want:
        event = roller.weighted(pool, "事件")
        chosen.append(event)
        pool = [(e, w) for e, w in pool if e["id"] != event["id"]]
    return chosen


def rarity_of(chosen: list[dict]) -> str:
    """稀有度只看事件，但门槛收紧过：

    两条甲 → 天品；一条甲 或 两条乙 → 玄品；三条以上（含丙）→ 灵品；其余凡品。
    """
    grades = [int(e["grade"]) for e in chosen]
    top = grades.count(1)
    second = grades.count(2)
    if top >= 2:
        return "天"
    if top == 1 or second >= 2:
        return "玄"
    if len(grades) >= 3 and min(grades) <= 3:
        return "灵"
    return "凡"


def roll_player_attrs(seed: str | None = None) -> dict:
    """玩家属性：先 4d6↓ 掷六次，再用「随机自由点」补到 72。

    总值恒为 72，但每条属性的落点是随机掷出来 + 随机补点的结果，
    所以每次开卡都不一样，不会出现「平均 12」的无聊配置。
    """
    seed = seed or new_seed()
    roller = Roller(seed=seed)
    attrs = {key: max(ATTR_MIN, min(ATTR_MAX, roll4d6_drop_lowest(roller)))
             for key in ATTR_KEYS}

    guard = 0
    while sum(attrs.values()) != PLAYER_POINTS and guard < 1000:
        guard += 1
        total = sum(attrs.values())
        if total < PLAYER_POINTS:
            pool = [k for k in ATTR_KEYS if attrs[k] < ATTR_MAX]
            if not pool:
                break
            attrs[roller.choice(pool, "补点")] += 1
        else:
            pool = [k for k in ATTR_KEYS if attrs[k] > ATTR_MIN]
            if not pool:
                break
            attrs[roller.choice(pool, "扣点")] -= 1

    return {"attrs": attrs, "total": sum(attrs.values()), "seed": seed}


def traits_of(events: list[dict], cap: int = 4) -> list[dict]:
    names: list[str] = []
    for event in events:
        for name in event.get("traits", []):
            if name in traits_mod.TRAITS and name not in names:
                names.append(name)
    return [{"name": n, "desc": traits_mod.TRAITS[n]["desc"],
             "tier": traits_mod.TRAITS[n]["tier"]} for n in names[:cap]]


def evaluate(city: dict, chosen: list[dict], monster_hp: int = 0) -> dict:
    difficulty = missions_mod.difficulty_of(chosen, monster_hp, city["tier"])
    return {
        "difficulty": difficulty,
        "grade": missions_mod.grade_label(difficulty),
        "reward": missions_mod.reward_of(difficulty),
        "event_count": len(chosen),
        "max_events": world.max_events(city["id"]),
    }


def roll_npc(city_id: str | None = None, mission_id: str | None = None,
             seed: str | None = None) -> dict:
    """随机生成一个人物（NPC）。"""
    seed = seed or new_seed()
    roller = Roller(seed=seed)

    city = world.CITY_BY_ID[city_id] if city_id else pick_city(roller)
    ceiling = world.max_events(city["id"])
    want = roller.randint(1, ceiling)
    chosen = pick_events(roller, city, mission_id, want, background=True)
    if not chosen:
        chosen = pick_events(roller, world.CITY_BY_ID["nanyu"], None, 1)

    school = roller.weighted(list(gacha.SCHOOL_WEIGHTS.items()), "流派")
    element = roller.choice(["金", "木", "水", "火", "土"], "本命五行")

    bonus = TIER_ATTR_BONUS.get(city["tier"], 0)
    attrs = {}
    for key in ATTR_KEYS:
        value = roll4d6_drop_lowest(roller) + bonus
        attrs[key] = max(3, min(20, value))
    for key, floor in gacha.SCHOOL_FLOOR[school].items():
        attrs[key] = max(attrs[key], floor + max(0, bonus))

    rarity = rarity_of(chosen)
    rank = RANK_BY_RARITY[rarity]

    approval = {}
    if rank != "初真":
        from ..content import spirits

        for spirit in spirits.available(rank):
            approval[spirit["id"]] = roller.randint(5, 45)

    name = roller.choice(list(gacha.SURNAMES)) + roller.choice(gacha.GIVEN)
    note = chosen[0]["hook"] if chosen else "档案缺页。"

    return {
        "kind": "npc",
        "code": _code(seed),
        "name": name,
        "school": school,
        "element": element,
        "rarity": rarity,
        "rank": rank,
        "merit": roller.randint(0, 30),
        "attrs": attrs,
        "traits": traits_of(chosen),
        "approval": approval,
        "notes": note,
        "seed": seed,
        "city": city["id"],
        "events": [e["id"] for e in chosen],
        "mission": mission_id,
        "difficulty": evaluate(city, chosen)["difficulty"],
        "reward": evaluate(city, chosen)["reward"],
    }


def validate_attrs(attrs: dict) -> list[str]:
    problems = []
    for key in ATTR_KEYS:
        value = int(attrs.get(key, 0))
        if value < ATTR_MIN or value > ATTR_MAX:
            problems.append("%s 必须在 %d–%d 之间" % (key, ATTR_MIN, ATTR_MAX))
    total = sum(int(attrs.get(k, 0)) for k in ATTR_KEYS)
    if total != PLAYER_POINTS:
        problems.append("属性总和必须是 %d，现在是 %d" % (PLAYER_POINTS, total))
    return problems


def build_player(payload: dict, seed: str | None = None) -> dict:
    """玩家自建角色。payload 已经由接口层校验过类型。"""
    seed = seed or new_seed()
    roller = Roller(seed=seed)

    city_id = payload.get("city") or "nanyu"
    city = world.CITY_BY_ID.get(city_id)
    if not city:
        raise ValueError("没有这个城市：%s" % city_id)

    school = payload.get("school")
    if school not in sheet.SCHOOLS:
        raise ValueError("没有这个流派：%s" % school)

    element = payload.get("element")
    if element not in ("金", "木", "水", "火", "土"):
        raise ValueError("本命五行不合法")

    attrs = {k: int(payload.get("attrs", {}).get(k, 10)) for k in ATTR_KEYS}
    if not payload.get("attrs"):
        attrs = roll_player_attrs(seed)["attrs"]
    problems = validate_attrs(attrs)
    if problems:
        raise ValueError("；".join(problems))
    attrs = {k: int(v) for k, v in attrs.items()}

    wanted = payload.get("events") or []
    chosen = pick_events(roller, city, None, len(wanted), allowed_ids=wanted)
    if len(chosen) < len(wanted):
        raise ValueError("有事件不适合这座城市：选了 %d 条，只有 %d 条可用" % (len(wanted), len(chosen)))

    return {
        "kind": "player",
        "code": _code(seed),
        "name": (payload.get("name") or "无名").strip()[:16],
        "school": school,
        "element": element,
        "rarity": "凡",
        "rank": "初真",
        "merit": 20,
        "attrs": attrs,
        "traits": traits_of(chosen),
        "approval": {},
        "notes": (payload.get("notes") or "").strip()[:200] or "玩家自建档案。",
        "seed": seed,
        "city": city["id"],
        "events": [e["id"] for e in chosen],
        "mission": None,
        "difficulty": evaluate(city, chosen)["difficulty"],
        "reward": evaluate(city, chosen)["reward"],
    }
