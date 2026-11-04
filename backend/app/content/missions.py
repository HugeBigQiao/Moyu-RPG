"""任务。

两种：
  fixed  —— 写在剧本库里、绑定城市的案子（现在的五个）
  random —— 由「城市 + 事件」现场拼出来的，不写死剧情，靠事件文本当骨

难度与奖励都从事件强度推：
    难度 = Σ(5 − 事件等级) + 祟物体量/10 + 城市等级修正
    奖励 = 难度 × 3（功德）
所以「甲级事件带出来的人」= 难案 = 高报酬。
"""

from __future__ import annotations

from . import scenario as scenario_mod
from . import world

MISSIONS = [
    {
        "id": "mirror",
        "name": "镜中鬼",
        "tier": 2,
        "kind": "fixed",
        "cities": ["nanyu"],
        "scenario_id": "mirror",
        "blurb": "新城国际中学连续自残，监控拍到学生凌晨对镜梳头。",
    },
    {
        "id": "office",
        "name": "写字楼血案",
        "tier": 2,
        "kind": "fixed",
        "cities": ["nanyu"],
        "scenario_id": "office",
        "blurb": "深夜加班的白领集体跳楼，监控显示他们对着空气跪拜。",
    },
    {
        "id": "paper",
        "name": "送纸",
        "tier": 3,
        "kind": "fixed",
        "cities": ["nanyu", "baishi"],
        "scenario_id": "paper",
        "blurb": "独居老人死了七天没人发现，他扎的纸人每晚在街上走。",
    },
    {
        "id": "nightrun",
        "name": "夜航",
        "tier": 2,
        "kind": "fixed",
        "cities": ["nanyu", "yunjin"],
        "scenario_id": "nightrun",
        "blurb": "高架上连着三晚有人失联，第二天出现在二十公里外的出口。",
    },
    {
        "id": "drought",
        "name": "旱骨",
        "tier": 3,
        "kind": "fixed",
        "cities": ["nanyu", "qingxi", "baishi"],
        "scenario_id": "drought",
        "blurb": "水库见底露出淹没的老村，村里开始有人脱水而死，可水缸是满的。",
    },
]

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
