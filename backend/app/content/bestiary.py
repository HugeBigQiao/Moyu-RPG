"""祟物图鉴（从 content/bestiary.json 读）。

三态决定「什么打得动它」：灵体 / 附身 / 实体。
"""

from __future__ import annotations

from ._store import load, register

BESTIARY: list[dict] = []
BESTIARY_BY_ID: dict[str, dict] = {}


def apply(force: bool = False) -> None:
    global BESTIARY, BESTIARY_BY_ID
    BESTIARY = load("bestiary", force)["bestiary"]
    BESTIARY_BY_ID = {m["id"]: m for m in BESTIARY}


def get(monster_id: str) -> dict | None:
    return BESTIARY_BY_ID.get(monster_id)


def phase_index(monster: dict, hp: int) -> int:
    """当前是第几形态（0 起）。"""
    phases = monster["phases"]
    if len(phases) <= 1:
        return 0
    ratio = hp / max(1, int(monster["hp"]))
    if len(phases) == 2:
        return 0 if ratio > 0.45 else 1
    if ratio > 0.6:
        return 0
    if ratio > 0.3:
        return 1
    return 2


def phase_for(monster: dict, hp: int) -> dict:
    """按剩余血量百分比选当前形态。"""
    return monster["phases"][phase_index(monster, hp)]


def state_gate(state: str, damage_type: str) -> float:
    """某个形态下这种伤害吃几成。"""
    table = {
        "灵体": {"physical": 0.0, "spell": 1.0, "talisman": 1.0},
        "附身": {"physical": 0.5, "spell": 1.0, "talisman": 1.0},
        "实体": {"physical": 1.0, "spell": 1.0, "talisman": 1.0},
    }
    return table.get(state, {}).get(damage_type, 1.0)


register("bestiary", apply)
apply()
