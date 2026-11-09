"""符箓（从 content/talismans.json 读）。

符箓派的核心资产：绘制成本 vs 引动成本。
"""

from __future__ import annotations

from ._store import load, register

TALISMANS: list[dict] = []
TALISMAN_BY_ID: dict[str, dict] = {}


def apply(force: bool = False) -> None:
    global TALISMANS, TALISMAN_BY_ID
    TALISMANS = load("talismans", force)["talismans"]
    TALISMAN_BY_ID = {t["id"]: t for t in TALISMANS}


def get(talisman_id: str) -> dict | None:
    return TALISMAN_BY_ID.get(talisman_id)


register("talismans", apply)
apply()
