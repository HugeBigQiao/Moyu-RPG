"""任务（从 content/missions.json 读）。

固定任务绑定城市；随机任务由 engine/mission.py 现场拼。
难度与奖励都从事件强度推。
"""

from __future__ import annotations

from . import scenario as scenario_mod
from . import world
from ._store import load, register

MISSIONS: list[dict] = []
MISSION_BY_ID: dict[str, dict] = {}


def apply(force: bool = False) -> None:
    global MISSIONS, MISSION_BY_ID
    MISSIONS = load("missions", force)["missions"]
    MISSION_BY_ID = {m["id"]: m for m in MISSIONS}


def get(mission_id: str) -> dict | None:
    return MISSION_BY_ID.get(mission_id)


def scenario_of(mission: dict) -> dict | None:
    return scenario_mod.get(mission["scenario_id"]) if mission.get("scenario_id") else None


def for_city(city_id: str) -> list[dict]:
    return [m for m in MISSIONS if city_id in m.get("cities", [])]


def difficulty_of(events: list[dict], monster_hp: int = 0, city_tier: str = "t2") -> int:
    base = sum(5 - int(e["grade"]) for e in events)
    weight = round(monster_hp / 10)
    tier_bonus = {"t0": 3, "t1": 2, "t2": 1, "t3": 0, "t4": -1}.get(city_tier, 1)
    return max(1, base * 2 + weight + tier_bonus)


def reward_of(difficulty: int) -> int:
    return max(5, difficulty * 3)


def grade_label(difficulty: int) -> str:
    if difficulty >= 24:
        return "甲"
    if difficulty >= 16:
        return "乙"
    if difficulty >= 9:
        return "丙"
    return "丁"


def random_seed_pool(city_id: str) -> list[dict]:
    """这个城市能接到的案子类型（用行业来命名任务帽）。"""
    city = world.CITY_BY_ID.get(city_id)
    if not city:
        return []
    return [world.INDUSTRY_BY_ID[i] for i in city["industries"] if i in world.INDUSTRY_BY_ID]


register("missions", apply)
apply()
