"""英灵数据加载器。

职责：
    读英灵表，提供按箓职筛选、认可度折算消耗与继承比例。
为什么需要：
    授箓体系的核心数值都在这里，晋升与请神共用。
上下游：
    上游：data/content/spirits.json；下游：engine/progress、engine/session。
"""


from __future__ import annotations

from ._store import load, register

SPIRITS: list[dict] = []
SPIRIT_BY_ID: dict[str, dict] = {}

RANKS = ("初真", "盟威", "五雷", "天师")


def apply(force: bool = False) -> None:
    global SPIRITS, SPIRIT_BY_ID
    SPIRITS = load("spirits", force)["spirits"]
    SPIRIT_BY_ID = {s["id"]: s for s in SPIRITS}


def available(rank: str) -> list[dict]:
    """当前箓职能请到的英灵。"""
    if rank not in RANKS:
        rank = "初真"
    limit = RANKS.index(rank)
    return [s for s in SPIRITS if RANKS.index(s["rank"]) <= limit]


def get(spirit_id: str) -> dict | None:
    return SPIRIT_BY_ID.get(spirit_id)


def approval_cost(spirit: dict, approval: int) -> int:
    """认可度每 20 点减 10% 灵力消耗。"""
    base = int(spirit["cost"])
    return max(1, round(base * (1 - (approval // 20) * 0.10)))


def inherit_ratio(approval: int) -> float:
    """能力继承比例：认可度 0 时四成，满认可度时满值。"""
    return 0.4 + 0.6 * max(0, min(100, approval)) / 100.0


register("spirits", apply)
apply()
