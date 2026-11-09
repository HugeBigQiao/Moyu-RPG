"""世界底座（从 content/world.json 读）。

国家、教派、机构、人物、行业、城市分级、城市、地图坐标、城市势力、世界背景。
改设定请改 JSON，不要改这里。
"""

from __future__ import annotations

from ._store import load, register

NATIONS: list[dict] = []
SECTS: list[dict] = []
AGENCIES: list[dict] = []
FIGURES: list[dict] = []
INDUSTRIES: list[dict] = []
CITY_TIERS: list[dict] = []
CITIES: list[dict] = []
CITY_GEO: dict[str, list[float]] = {}
CITY_FACTIONS: dict[str, list[dict]] = {}
LORE: list[dict] = []

NATION_BY_ID: dict[str, dict] = {}
SECT_BY_ID: dict[str, dict] = {}
AGENCY_BY_ID: dict[str, dict] = {}
FIGURE_BY_ID: dict[str, dict] = {}
INDUSTRY_BY_ID: dict[str, dict] = {}
CITY_BY_ID: dict[str, dict] = {}
TIER_BY_KEY: dict[str, dict] = {}


def apply(force: bool = False) -> None:
    global NATIONS, SECTS, AGENCIES, FIGURES, INDUSTRIES
    global CITY_TIERS, CITIES, CITY_GEO, CITY_FACTIONS, LORE
    global NATION_BY_ID, SECT_BY_ID, AGENCY_BY_ID, FIGURE_BY_ID
    global INDUSTRY_BY_ID, CITY_BY_ID, TIER_BY_KEY

    data = load("world", force)
    NATIONS = data["nations"]
    SECTS = data["sects"]
    AGENCIES = data["agencies"]
    FIGURES = data["figures"]
    INDUSTRIES = data["industries"]
    CITY_TIERS = data["tiers"]
    CITIES = data["cities"]
    CITY_GEO = data.get("city_geo", {})
    CITY_FACTIONS = data.get("city_factions", {})
    LORE = data.get("lore", [])

    NATION_BY_ID = {n["id"]: n for n in NATIONS}
    SECT_BY_ID = {s["id"]: s for s in SECTS}
    AGENCY_BY_ID = {a["id"]: a for a in AGENCIES}
    FIGURE_BY_ID = {f["id"]: f for f in FIGURES}
    INDUSTRY_BY_ID = {i["id"]: i for i in INDUSTRIES}
    CITY_BY_ID = {c["id"]: c for c in CITIES}
    TIER_BY_KEY = {t["key"]: t for t in CITY_TIERS}


def tier_rank(key: str) -> int:
    """越小越大。"""
    for index, tier in enumerate(CITY_TIERS):
        if tier["key"] == key:
            return index
    return len(CITY_TIERS) - 1


def cities_by_tier(tier: str) -> list[dict]:
    return [c for c in CITIES if c["tier"] == tier]


def max_events(city_id: str) -> int:
    city = CITY_BY_ID.get(city_id)
    if not city:
        return 2
    return int(TIER_BY_KEY[city["tier"]]["max_events"])


def industry_name(industry_id: str) -> str:
    return INDUSTRY_BY_ID.get(industry_id, {}).get("name", industry_id)


def geo_of(city_id: str) -> tuple[float, float]:
    point = CITY_GEO.get(city_id, [35.0, 105.0])
    return float(point[0]), float(point[1])


def factions_of(city_id: str) -> list[dict]:
    return CITY_FACTIONS.get(city_id, [])


register("world", apply)
apply()
