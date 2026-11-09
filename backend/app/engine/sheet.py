"""角色卡：六维属性、衍生资源、技能值。

《玄门诡事录》里的资源是按流派分配的，这里全部集中算一遍，
避免每个页面各算一套导致数值对不上。
"""

from __future__ import annotations

from ..content import shop as shop_mod

SCHOOLS = {
    "fulu": {
        "name": "符箓派",
        "short": "符",
        "mp_attr": "int",
        "tagline": "门槛低，靠提前画符与请神，临场爆发看准备",
        "bonus": {"arcana": 15, "spell": 5},
    },
    "neidan": {
        "name": "内丹派",
        "short": "丹",
        "mp_attr": "wil",
        "tagline": "纯修自身，法术最强也最脆，怕近身",
        "bonus": {"spell": 15, "wuxing": 10},
    },
    "guti": {
        "name": "体修",
        "short": "体",
        "mp_attr": "con",
        "tagline": "炼体，靠气血硬扛，气血归零即昏迷",
        "bonus": {"melee": 15, "athletics": 10},
    },
    "jianxiu": {
        "name": "剑修",
        "short": "剑",
        "mp_attr": "wil",
        "tagline": "兵器一脉，剑意驱动，兵毁则战力崩",
        "bonus": {"blade": 20, "athletics": 5},
    },
    "anqi": {
        "name": "暗器",
        "short": "暗",
        "mp_attr": "agi",
        "tagline": "杀气蓄爆，被近身就废一半",
        "bonus": {"hidden": 20, "investigate": 5},
    },
}

ATTRS = {
    "str": "力",
    "agi": "敏",
    "con": "体",
    "int": "智",
    "wil": "意",
    "per": "感",
}

SKILLS = {
    "arcana": ("符咒学", "int"),
    "spell": ("法术", "wil"),
    "melee": ("体术", "str"),
    "blade": ("御剑", "wil"),
    "hidden": ("暗器", "agi"),
    "athletics": ("身法", "agi"),
    "investigate": ("侦查", "per"),
    "wuxing": ("五行感应", "per"),
    "resist": ("精神抵抗", "wil"),
    "persuade": ("话术", "wil"),
}

RANKS = ("初真", "盟威", "五雷", "天师")

# 特性表在 content/traits.py 里（分甲/乙/丙/丁四级）。这里保留 sheet.TRAITS 这个名字，
# 但每次内容热重载都要跟着刷新，否则会拿着旧 dict。
from ..content import traits as _traits  # noqa: E402
from ..content._store import register as _register  # noqa: E402

TRAITS = _traits.TRAITS


def _refresh_traits(force: bool = False) -> None:
    global TRAITS
    TRAITS = _traits.TRAITS


_register("sheet.traits", _refresh_traits)


def _attr(character: dict, key: str) -> int:
    return int(character.get("attrs", {}).get(key, 10))


def trait_sum(character: dict, key: str) -> int:
    total = 0
    for trait in character.get("traits", []):
        name = trait.get("name") if isinstance(trait, dict) else trait
        spec = TRAITS.get(name or "")
        if spec:
            total += int(spec.get("effect", {}).get(key, 0))
    return total


def school_of(character: dict) -> dict:
    return SCHOOLS.get(character.get("school", "fulu"), SCHOOLS["fulu"])


def skill_value(character: dict, skill_id: str) -> int:
    name, attr_key = SKILLS[skill_id]
    base = _attr(character, attr_key) * 5
    bonus = int(school_of(character).get("bonus", {}).get(skill_id, 0))
    bonus += trait_sum(character, skill_id)
    bonus += int(character.get("skill_bonus", {}).get(skill_id, 0))
    bonus += int(shop_mod.effects_of(character)["skill"].get(skill_id, 0))
    bonus -= karma_penalty(character)
    return max(1, min(99, base + bonus))


def karma_penalty(character: dict) -> int:
    """业障：每层让所有检定 −10。"""
    return 10 * int(character.get("karma_debt", 0) or 0)


def derived(character: dict) -> dict:
    """把一张卡的全部衍生数值算出来。"""
    school = school_of(character)
    mp_attr = school["mp_attr"]
    con = _attr(character, "con")
    intel = _attr(character, "int")
    wil = _attr(character, "wil")
    agi = _attr(character, "agi")

    hp_max = con * 5 + trait_sum(character, "hp")
    mp_max = _attr(character, mp_attr) * 2 + trait_sum(character, "mp")
    san_max = max(10, wil * 5 + trait_sum(character, "san"))
    effects = shop_mod.effects_of(character)
    san_max += int(effects["san_max"])

    jianyi_max = wil * 2 if character.get("school") in ("jianxiu", "neidan") else wil
    shaqi_max = agi * 2 if character.get("school") == "anqi" else agi

    return {
        "hp_max": max(1, hp_max),
        "mp_max": max(1, mp_max),
        "san_max": san_max,
        "jianyi_max": jianyi_max,
        "shaqi_max": shaqi_max,
        "mp_source": ATTRS[mp_attr],
        "agility": agi + trait_sum(character, "agility"),
        "initiative": agi * 2 + trait_sum(character, "agility") * 2,
        "rank_index": RANKS.index(character.get("rank", "初真")),
        "can_summon": RANKS.index(character.get("rank", "初真")) >= 1,
        "summon_bonus": trait_sum(character, "summon"),
        "merit": int(character.get("merit", 0)) + trait_sum(character, "merit"),
        "karma_penalty": karma_penalty(character),
        "karma_debt": int(character.get("karma_debt", 0) or 0),
        "draw_pool": max(1, intel * 2 + int(effects["draw_pool"])),
        "summon_discount": int(effects["summon_discount"]),
        "skills": {sid: skill_value(character, sid) for sid in SKILLS},
    }


def display_attrs(character: dict) -> list[dict]:
    out = []
    for key, label in ATTRS.items():
        value = _attr(character, key)
        out.append({
            "key": key,
            "label": label,
            "value": value,
            "pct": round(value / 18 * 100),
            "tier": "high" if value >= 15 else "mid" if value >= 10 else "low",
        })
    return out
