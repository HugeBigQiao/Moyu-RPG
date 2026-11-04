"""功德商店。

货架分两类：
  正品 —— 花功德买，效果稳定（桃木剑、鲁班书残卷、定神丹）
  阴器 —— 不花功德甚至倒贴，但要背「业障」：每层业障让所有检定 −10

价格单位是功德（merit）。负价表示「这件东西反而不花钱，代价在别处」。
"""

from __future__ import annotations

ITEMS = [
    {
        "id": "taomu",
        "name": "百年桃木剑",
        "price": 100,
        "kind": "法器",
        "desc": "雷击过的老桃木削的剑坯，对木属祟物 +2 伤害。",
        "effect": {"damage_vs": {"木": 2}},
        "max_qty": 1,
    },
    {
        "id": "luban",
        "name": "《鲁班书》残卷",
        "price": 300,
        "kind": "典籍",
        "desc": "机关术的根，符咒学 +10。看懂的人不多，看懂的都没好下场。",
        "effect": {"skill": {"arcana": 10}},
        "max_qty": 1,
    },
    {
        "id": "qingshenfu",
        "name": "请神符",
        "price": 500,
        "kind": "符",
        "desc": "玄真司特制，请神灵力消耗 −3（最低 1）。限盟威箓以上。",
        "effect": {"summon_discount": 3},
        "requires_rank": "盟威",
        "max_qty": 1,
    },
    {
        "id": "dingshen_dan",
        "name": "定神丹",
        "price": 60,
        "kind": "丹药",
        "desc": "朱砂裹的安神丸，理智上限 +5。吃多了会手抖。",
        "effect": {"san_max": 5},
        "max_qty": 3,
    },
    {
        "id": "shihunding",
        "name": "噬魂钉",
        "price": 0,
        "kind": "阴器",
        "desc": "阴器。伤害 +3，但每持一件，业障 +1（所有检定 −10）。",
        "effect": {"damage_flat": 3, "karma_debt": 1},
        "max_qty": 3,
        "corrupt": True,
    },
    {
        "id": "huangfu",
        "name": "黄符纸（一叠）",
        "price": 30,
        "kind": "耗材",
        "desc": "每日符力 +4，画符不再捉襟见肘。",
        "effect": {"draw_pool": 4},
        "max_qty": 3,
    },
]

ITEM_BY_ID = {i["id"]: i for i in ITEMS}


def get(item_id: str) -> dict | None:
    return ITEM_BY_ID.get(item_id)


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
