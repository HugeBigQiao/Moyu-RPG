"""装备数据加载器。

职责：
    读装备表并建 id 索引。
为什么需要：
    装备是档案页与后续战斗扩展的数据源。
上下游：
    上游：data/content/equipment.json；下游：api/archive（及未来的战斗结算）。
"""


from __future__ import annotations

from ._store import load, register

EQUIPMENT: list[dict] = []
EQUIPMENT_BY_ID: dict[str, dict] = {}
GRADE_INFO: dict[int, str] = {1: "甲", 2: "乙", 3: "丙", 4: "丁"}


def apply(force: bool = False) -> None:
    global EQUIPMENT, EQUIPMENT_BY_ID
    EQUIPMENT = load("equipment", force)["equipment"]
    EQUIPMENT_BY_ID = {e["id"]: e for e in EQUIPMENT}


def get(item_id: str) -> dict | None:
    return EQUIPMENT_BY_ID.get(item_id)


def by_kind(kind: str) -> list[dict]:
    return [e for e in EQUIPMENT if e["kind"] == kind]


register("equipment", apply)
apply()
