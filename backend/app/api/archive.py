"""档案接口。

职责：
    对外输出世界、事件、任务、装备、特性、剧本，以及内容热重载。
为什么需要：
    档案页只读内容，不该让前端直接读文件；热重载也归这里管。
上下游：
    上游：app/content/*（读 JSON）；下游：前端档案页、/api/admin/*。
"""


from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..content import (bestiary, equipment as equipment_mod, events as events_mod,
                       missions as missions_mod, scenario as scenario_mod, shop,
                       spirits, talismans, traits as traits_mod, world)
from ..content._store import reload_all, status
from ..engine import mission as mission_engine
from .common import city_payload

router = APIRouter(prefix="/api", tags=["archive"])


@router.get("/world")
async def api_world():
    return {
        "nations": world.NATIONS,
        "sects": world.SECTS,
        "agencies": world.AGENCIES,
        "figures": world.FIGURES,
        "industries": world.INDUSTRIES,
        "lore": world.LORE,
        "tiers": world.CITY_TIERS,
        "cities": [city_payload(city) for city in world.CITIES],
    }


@router.get("/events")
async def api_events():
    return {
        "events": [{
            **event,
            "grade_name": events_mod.grade_name(event["grade"]),
            "trait_names": [
                {"name": n, **traits_mod.TRAITS[n]} for n in event.get("traits", [])
                if n in traits_mod.TRAITS
            ],
        } for event in events_mod.EVENTS],
        "grades": events_mod.GRADE_INFO,
        "trait_tiers": traits_mod.TRAIT_TIERS,
    }


@router.get("/missions")
async def api_missions():
    return {
        "missions": [{
            **mission,
            "city_names": [world.CITY_BY_ID[c]["name"] for c in mission.get("cities", [])
                           if c in world.CITY_BY_ID],
            "scenario": mission.get("scenario_id"),
        } for mission in missions_mod.MISSIONS],
        "random_types": [{
            "city": c["id"], "city_name": c["name"], "tier": c["tier"],
            "industries": [world.industry_name(i) for i in c["industries"]],
        } for c in world.CITIES],
    }


@router.get("/missions/random")
async def api_random_missions(city: str = "nanyu", count: int = 3):
    if city not in world.CITY_BY_ID:
        raise HTTPException(404, "没有这个城市")
    return {"city": city, "samples": mission_engine.preview(city, count)}


@router.get("/equipment")
async def api_equipment():
    return {
        "equipment": [{
            **item,
            "grade_name": equipment_mod.GRADE_INFO.get(item["grade"], "?"),
        } for item in equipment_mod.EQUIPMENT],
        "kinds": ["法器", "阴器", "耗材", "护具"],
    }


@router.get("/traits")
async def api_traits():
    return {
        "traits": [{"name": name, **spec,
                    "tier_name": traits_mod.TRAIT_TIERS[spec["tier"]]["name"]}
                   for name, spec in traits_mod.TRAITS.items()],
        "tiers": traits_mod.TRAIT_TIERS,
    }


@router.get("/scenarios")
async def api_scenarios():
    return {
        "scenarios": scenario_mod.SCENARIOS,
        "bestiary": bestiary.BESTIARY,
        "talismans": talismans.TALISMANS,
        "spirits": spirits.SPIRITS,
        "shop": shop.ITEMS,
    }


# ---------------------------------------------------------------- 内容管理

@router.get("/admin/content")
async def api_content_status():
    """看内容目录里有哪些文件、有没有加载错误。"""
    return status()


@router.post("/admin/reload")
async def api_content_reload():
    """改完 JSON 不用重启，调这个就重新读一遍。"""
    return {"report": reload_all(), "status": status()}
