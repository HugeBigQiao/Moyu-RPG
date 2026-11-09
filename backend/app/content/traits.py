"""人物特性（从 content/traits.json 读）。

特性分甲/乙/丙/丁四级，等级越高越稀缺。
effect 的键要和 engine/sheet.py 里的算法对上。
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
