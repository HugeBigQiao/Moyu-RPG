"""功德商店（从 content/shop.json 读）。

价格单位是功德。阴器不贵，代价在业障。
"""

from __future__ import annotations

from ._store import load, register

ITEMS: list[dict] = []
ITEM_BY_ID: dict[str, dict] = {}


def apply(force: bool = False) -> None:
    global ITEMS, ITEM_BY_ID
    ITEMS = load("shop", force)["items"]
    ITEM_BY_ID = {i["id"]: i for i in ITEMS}


def get(item_id: str) -> dict | None:
    return ITEM_BY_ID.get(item_id)


def visible(rank: str) -> list[dict]:
    from ..engine.sheet import RANKS

    limit = RANKS.index(rank) if rank in RANKS else 0
    out = []
    for item in ITEMS:
        need = item.get("requires_rank")
        if need and RANKS.index(need) > limit:
            continue
        out.append(item)
    return out


def effects_of(character: dict) -> dict:
    """把角色身上所有东西的加成合成一份。纯函数，不依赖引擎。"""
    out = {
        "damage_vs": {},
        "damage_flat": 0,
        "skill": {},
        "san_max": 0,
        "draw_pool": 0,
        "summon_discount": 0,
    }
    for entry in character.get("items") or []:
        spec = ITEM_BY_ID.get(entry.get("id", ""))
        if not spec:
            continue
        qty = int(entry.get("qty", 1))
        effect = spec.get("effect", {})
        for element, bonus in (effect.get("damage_vs") or {}).items():
            out["damage_vs"][element] = out["damage_vs"].get(element, 0) + bonus * qty
        out["damage_flat"] += int(effect.get("damage_flat", 0)) * qty
        for skill_id, bonus in (effect.get("skill") or {}).items():
            out["skill"][skill_id] = out["skill"].get(skill_id, 0) + bonus * qty
        out["san_max"] += int(effect.get("san_max", 0)) * qty
        out["draw_pool"] += int(effect.get("draw_pool", 0)) * qty
        out["summon_discount"] += int(effect.get("summon_discount", 0)) * qty
    return out


register("shop", apply)
apply()
