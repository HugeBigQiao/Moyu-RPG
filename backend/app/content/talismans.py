"""符箓数据加载器。

职责：
    读符箓表并建 id 索引。
为什么需要：
    符箓是战斗里的主要道具，加载失败会让整场战斗不可用。
上下游：
    上游：data/content/talismans.json；下游：engine/session、api/characters。
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
