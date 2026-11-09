"""特性数据加载器。

职责：
    读特性表，提供按等级取用与随机抽取。
为什么需要：
    特性会被事件赋予、被角色卡计算，键名必须与 sheet 的算法对齐。
上下游：
    上游：data/content/traits.json；下游：engine/sheet、engine/npc。
"""


from __future__ import annotations

from ._store import load, register

TRAIT_TIERS: dict = {}
TRAITS: dict[str, dict] = {}
NAME_BY_ID: dict[str, str] = {}


def apply(force: bool = False) -> None:
    global TRAIT_TIERS, TRAITS, NAME_BY_ID
    data = load("traits", force)
    TRAIT_TIERS = {int(k): v for k, v in data["tiers"].items()}
    TRAITS = data["traits"]
    NAME_BY_ID = {name: name for name in TRAITS}


def by_tier(tier: int) -> list[dict]:
    return [{"name": name, **spec} for name, spec in TRAITS.items() if spec["tier"] == tier]


def pick_from_names(names: list[str], count: int, roller) -> list[str]:
    """从给定特性名里抽 count 个（去重、保持顺序）。"""
    pool = [n for n in names if n in TRAITS]
    if not pool:
        return []
    picked = roller.sample(pool, min(count, len(pool)), "事件赋予特性")
    return list(dict.fromkeys(picked))


register("traits", apply)
apply()
