"""旧版抽卡。

职责：
    按稀有度权重生成角色卡（保留兼容，新流程用 npc.py）。
为什么需要：
    早期版本靠它出卡；现在人物生成已迁到 npc，但接口仍被保留。
上下游：
    上游：sheet、dice；下游：api/characters 的 /gacha。
"""


from __future__ import annotations

import hashlib

from ..engine import sheet
from ..engine.dice import Roller, new_seed, roll4d6_drop_lowest

RARITIES = [
    {"key": "凡", "name": "凡品", "weight": 50, "bonus": 0, "dice": "3d6", "traits": 1, "rank": "初真"},
    {"key": "灵", "name": "灵品", "weight": 28, "bonus": 0, "dice": "4d6", "traits": 2, "rank": "盟威"},
    {"key": "玄", "name": "玄品", "weight": 16, "bonus": 2, "dice": "4d6", "traits": 2, "rank": "五雷"},
    {"key": "天", "name": "天品", "weight": 6, "bonus": 4, "dice": "4d6", "traits": 3, "rank": "天师"},
]

RARITY_BY_KEY = {r["key"]: r for r in RARITIES}

# 流派的关键属性：低于这个值就往这一档抬
SCHOOL_FLOOR = {
    "fulu": {"int": 12, "wil": 10},
    "neidan": {"wil": 13, "int": 10},
    "guti": {"con": 13, "str": 12},
    "jianxiu": {"wil": 13, "agi": 11},
    "anqi": {"agi": 13, "per": 11},
}

SCHOOL_WEIGHTS = {
    "fulu": 26,
    "neidan": 22,
    "guti": 20,
    "jianxiu": 18,
    "anqi": 14,
}

SURNAMES = "赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳"
GIVEN = [
    "昭", "衡", "玄", "澈", "晏", "衍", "砚", "珩", "澈", "准",
    "知微", "听雪", "望舒", "临川", "见山", "云归", "扶摇", "疏影",
    "既明", "长庚", "南枝", "清让", "无咎", "守拙", "怀瑾", "照野",
]
POSTFIX = ["子", "生", "之", "言", "白", "一二"]

SCHOOL_TITLES = {
    "fulu": ["画符的", "走符箓的", "拿笔的"],
    "neidan": ["炼丹的", "坐枯禅的", "修内景的"],
    "guti": ["练拳的", "站桩的", "皮糙肉厚的"],
    "jianxiu": ["背剑的", "使剑的", "剑匣不离身的"],
    "anqi": ["玩暗器的", "袖里有东西的", "拈针的"],
}

FLAVOR = [
    "档案里只有一行：此人来历不详，手续齐全。",
    "档案里只有一行：此人有师承，但师门名录对不上。",
    "档案里只有一行：此人曾独自处理过一起三级阴浊事件，未上报。",
    "档案里只有一行：此人不肯说自己第一次见祟是哪年。",
    "档案里只有一行：此人登记的法器数量超过规定，未解释。",
]


def _code(seed: str) -> str:
    digest = hashlib.md5(seed.encode("utf-8")).hexdigest()
    return "nd-%s" % digest[:6]


def _attr_pool(roller: Roller, dice: str, bonus: int) -> dict:
    attrs = {}
    for key in sheet.ATTRS:
        if dice == "3d6":
            value = sum(roller.pool(3, 6, "属性生成"))
        else:
            value = roll4d6_drop_lowest(roller)
        attrs[key] = max(3, min(20, value + bonus))
    return attrs


def roll(seed: str | None = None) -> dict:
    """抽一张卡，返回可以直接入库的 dict。"""
    seed = seed or new_seed()
    roller = Roller(seed=seed)

    rarity = roller.weighted([(r["key"], r["weight"]) for r in RARITIES], "稀有度")
    spec = RARITY_BY_KEY[rarity]

    school = roller.weighted(list(SCHOOL_WEIGHTS.items()), "流派")
    attrs = _attr_pool(roller, spec["dice"], spec["bonus"])

    for key, floor in SCHOOL_FLOOR[school].items():
        if attrs[key] < floor:
            attrs[key] = floor

    element = roller.choice(["金", "木", "水", "火", "土"], "本命五行")

    trait_pool = [name for name in sheet.TRAITS if name != "业障缠身"]
    traits = roller.sample(trait_pool, spec["traits"], "特性")
    trait_payload = [{"name": t, "desc": sheet.TRAITS[t]["desc"]} for t in traits]

    name = roller.choice(list(SURNAMES)) + roller.choice(GIVEN)

    rank = spec["rank"]
    merit = roller.randint(0, 20) + (30 if rarity in ("玄", "天") else 0)

    approval = {}
    if rank != "初真":
        from ..content.spirits import available

        for spirit in available(rank):
            approval[spirit["id"]] = roller.randint(5, 45)

    return {
        "code": _code(seed),
        "name": name,
        "school": school,
        "element": element,
        "rarity": rarity,
        "rank": rank,
        "merit": merit,
        "attrs": attrs,
        "traits": trait_payload,
        "approval": approval,
        "notes": roller.choice(FLAVOR),
        "seed": seed,
        "title": roller.choice(SCHOOL_TITLES[school]),
    }


def roll_many(count: int) -> list[dict]:
    return [roll() for _ in range(max(1, min(10, count)))]


def rate_table() -> list[dict]:
    total = sum(r["weight"] for r in RARITIES)
    return [{**r, "pct": round(r["weight"] / total * 100, 1)} for r in RARITIES]
