"""事件数据加载器。

职责：
    读事件表，并提供兼容性判定与按城市/任务的加权抽取。
为什么需要：
    人物出身与随机任务都从事件池里长出来，规则必须共享一份。
上下游：
    上游：data/content/events.json、world；下游：engine/npc、engine/mission。
"""


from __future__ import annotations

from . import world
from ._store import load, register

EVENTS: list[dict] = []
EVENT_BY_ID: dict[str, dict] = {}
GRADE_INFO: dict = {}


def apply(force: bool = False) -> None:
    global EVENTS, EVENT_BY_ID, GRADE_INFO
    data = load("events", force)
    EVENTS = data["events"]
    GRADE_INFO = {int(k): v for k, v in data["grades"].items()}
    EVENT_BY_ID = {e["id"]: e for e in EVENTS}


def get(event_id: str) -> dict | None:
    return EVENT_BY_ID.get(event_id)


def grade_name(grade: int) -> str:
    return GRADE_INFO.get(grade, {"name": "?"})["name"]


def compatible(event: dict, city: dict, mission_id: str | None = None) -> bool:
    """这条事件能不能落在「这个城市 + 这个任务」上。"""
    scope = event.get("scope", "general")

    if scope == "mission":
        if not mission_id or mission_id not in event.get("missions", []):
            return False

    cities = event.get("cities") or []
    if cities and city["id"] not in cities:
        return False

    industries = event.get("industries") or []
    if industries and not (set(industries) & set(city.get("industries", []))):
        return False

    return True


def pool(city: dict, mission_id: str | None, max_grade: int = 4,
         background: bool = False) -> list[tuple[dict, float]]:
    """某城市某任务下可选的事件，带权重。

    background=True 是给随机人物用的：任务限定事件也能当出身，
    但只有特级/一级城市撑得住，权重打到三折。
    """
    out = []
    for event in EVENTS:
        if event["grade"] > max_grade:
            continue

        penalty = 1.0
        if event.get("scope") == "mission" and mission_id is None:
            if not background:
                continue
            if world.tier_rank(city["tier"]) > 1:
                continue
            if event.get("industries") and not (
                set(event["industries"]) & set(city.get("industries", []))
            ):
                continue
            penalty = 0.3
        elif not compatible(event, city, mission_id):
            continue

        weight = float(event.get("weight", 10)) * GRADE_INFO[event["grade"]]["weight_scale"] * penalty
        out.append((event, weight))
    return out


register("events", apply)
apply()
