"""装备库（从 content/equipment.json 读）。

四类：法器 / 阴器 / 耗材 / 护具。品阶用甲乙丙丁。
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
