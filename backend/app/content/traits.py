"""人物特性。

特性分四级（甲/乙/丙/丁），等级越高越稀缺：甲级通常来自大事件或大代价，
丁级就是些无伤大雅的怪毛病。

effect 的键要和 engine/sheet.py 里的算法对上：
    hp / mp / san / agility / merit / summon
    arcana / spell / melee / blade / hidden / athletics / investigate / wuxing / resist / persuade
"""

from __future__ import annotations

TRAIT_TIERS = {
    1: {"key": "甲", "name": "甲等", "blurb": "改变命运的东西，通常也改变了你"},
    2: {"key": "乙", "name": "乙等", "blurb": "明显的力量，或者明显的缺陷"},
    3: {"key": "丙", "name": "丙等", "blurb": "日常里用得上的东西"},
    4: {"key": "丁", "name": "丁等", "blurb": "脾气、习惯、怪毛病"},
}

TRAITS = {
    # ---- 甲 ----
    "天眼": {"tier": 1, "desc": "生来能见祟物真身，阴神自成", "effect": {"wuxing": 10, "san": -5}},
    "阴年阴月": {"tier": 1, "desc": "八字纯阴，感应力极强，也极招祟", "effect": {"wuxing": 10, "san": -10}},
    "不死债": {"tier": 1, "desc": "死过一次又回来了，从此祟物认你作同类", "effect": {"hp": 8, "san": -8}},
    "香火缠身": {"tier": 1, "desc": "身上有十几家庙的香火，请神代价低于常人", "effect": {"summon": 15, "mp": -3}},
    # ---- 乙 ----
    "童子功": {"tier": 2, "desc": "自幼筑基，经脉通畅", "effect": {"mp": 5}},
    "铜皮": {"tier": 2, "desc": "皮肉如革，寻常兵刃难入", "effect": {"hp": 5}},
    "胆大": {"tier": 2, "desc": "见怪不怪，心里那道坎早过了", "effect": {"san": 10}},
    "过目不忘": {"tier": 2, "desc": "看过的符箓记得住笔锋", "effect": {"arcana": 10}},
    "铁手": {"tier": 2, "desc": "手上功夫比嘴上利索", "effect": {"melee": 10}},
    "耳聪": {"tier": 2, "desc": "听得见墙那边的东西在动", "effect": {"investigate": 10}},
    # ---- 丙 ----
    "急智": {"tier": 3, "desc": "临场反应快，先手常在你", "effect": {"agility": 1}},
    "夜眼": {"tier": 3, "desc": "黑暗里看得比常人清楚", "effect": {"investigate": 5}},
    "跑得快": {"tier": 3, "desc": "打不过的时候，这一点很值钱", "effect": {"athletics": 10}},
    "嘴皮子": {"tier": 3, "desc": "能把要动手的人说到不动手", "effect": {"persuade": 10}},
    "药理通": {"tier": 3, "desc": "分得清药、毒和符灰", "effect": {"spell": 5}},
    # ---- 丁 ----
    "穷鬼": {"tier": 4, "desc": "法器全靠捡，胜在什么都敢用", "effect": {"hp": -2, "mp": 2}},
    "业障缠身": {"tier": 4, "desc": "手上沾过不该沾的东西", "effect": {"merit": -30}},
    "怕黑": {"tier": 4, "desc": "关灯那一下，他总要愣半秒", "effect": {"san": -5, "investigate": 5}},
    "夜猫子": {"tier": 4, "desc": "白天像死鱼，凌晨像换了个人", "effect": {"agility": 1, "san": -3}},
    "洁癖": {"tier": 4, "desc": "受不了一点脏，包括看不见的脏", "effect": {"wuxing": 5, "hp": -2}},
}

NAME_BY_ID = {name: name for name in TRAITS}


def by_tier(tier: int) -> list[dict]:
    return [
        {"name": name, **spec} for name, spec in TRAITS.items() if spec["tier"] == tier
    ]


def pick_from_names(names: list[str], count: int, roller) -> list[str]:
    """从给定特性名里抽 count 个（去重、保持顺序）。"""
    pool = [n for n in names if n in TRAITS]
    if not pool:
        return []
    picked = roller.sample(pool, min(count, len(pool)), "事件赋予特性")
    return list(dict.fromkeys(picked))
