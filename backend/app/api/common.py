"""接口层公用的小工具：ORM → 引擎 dict、列表摘要、城市视图。"""

from __future__ import annotations

import datetime as dt

from ..content import world
from ..engine import sheet
from ..models import Character


def card(ch: Character) -> dict:
    """ORM 对象 -> 引擎认的纯 dict。"""
    return {
        "school": ch.school,
        "element": ch.element,
        "rank": ch.rank,
        "attrs": ch.attrs or {},
        "traits": ch.traits or [],
        "approval": ch.approval or {},
        "merit": ch.merit,
        "items": ch.items or [],
        "completed_sessions": ch.completed_sessions or 0,
        "karma_good": ch.karma_good or 0,
        "karma_debt": ch.karma_debt or 0,
        "mind_trial_passed": bool(ch.mind_trial_passed),
    }


def brief(ch: Character) -> dict:
    stats = sheet.derived(card(ch))
    city = world.CITY_BY_ID.get(ch.city or "", {})
    return {
        "id": ch.id,
        "code": ch.code,
        "name": ch.name,
        "school": ch.school,
        "school_name": sheet.SCHOOLS.get(ch.school, {}).get("name", ch.school),
        "element": ch.element,
        "rarity": ch.rarity,
        "rank": ch.rank,
        "merit": ch.merit,
        "kind": ch.kind or "npc",
        "city": ch.city,
        "city_name": city.get("name", ch.city),
        "city_tier": city.get("tier", ""),
        "events": ch.events or [],
        "difficulty": ch.difficulty or 1,
        "reward": ch.reward or 5,
        "stats": {
            "hp_max": stats["hp_max"],
            "mp_max": stats["mp_max"],
            "san_max": stats["san_max"],
        },
    }


def stamp(value: dt.datetime | None) -> str:
    return value.strftime("%m-%d %H:%M") if value else ""


def city_payload(city: dict) -> dict:
    lat, lon = world.geo_of(city["id"])
    return {
        **city,
        "lat": lat,
        "lon": lon,
        "tier_name": world.TIER_BY_KEY[city["tier"]]["name"],
        "max_events": world.max_events(city["id"]),
        "industry_names": [world.industry_name(i) for i in city["industries"]],
        "nation_name": world.NATION_BY_ID.get(city["nation"], {}).get("name", city["nation"]),
        "factions": world.factions_of(city["id"]),
    }
