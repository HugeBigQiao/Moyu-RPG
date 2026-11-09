"""游戏页接口。

职责：
    总览、地图、城市面板三块数据。
为什么需要：
    这三块共享「城市 → 任务/人物/势力」的组装逻辑，放一起避免重复查询。
上下游：
    上游：app/content、app/models、app/engine/mission；下游：前端 GameView。
"""


from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..content import (missions as missions_mod, scenario as scenario_mod, world)
from ..models import get_db
from ..engine import mission as mission_engine
from ..models import Character, LogEntry, PlaySession
from .common import brief, city_payload, stamp

router = APIRouter(prefix="/api", tags=["game"])


@router.get("/dashboard")
async def api_dashboard(db: AsyncSession = Depends(get_db)):
    chars = (await db.execute(
        select(Character).order_by(desc(Character.id)).limit(6)
    )).scalars().all()
    sessions = (await db.execute(
        select(PlaySession).order_by(desc(PlaySession.id)).limit(8)
    )).scalars().all()

    names = {}
    if sessions:
        ids = {s.character_id for s in sessions}
        rows = (await db.execute(
            select(Character.id, Character.name).where(Character.id.in_(ids))
        )).all()
        names = {cid: name for cid, name in rows}

    scenario_names = {s["id"]: s["name"] for s in scenario_mod.SCENARIOS}
    total_chars = (await db.execute(select(func.count(Character.id)))).scalar_one()
    total_sessions = (await db.execute(select(func.count(PlaySession.id)))).scalar_one()
    active = (await db.execute(
        select(func.count(PlaySession.id)).where(PlaySession.status == "active")
    )).scalar_one()

    loads = [int((s.state or {}).get("corruption", 0)) for s in sessions if s.status == "active"]
    avg_load = round(sum(loads) / len(loads)) if loads else 0

    by_rarity = {}
    for key, name in (("凡", "凡品"), ("灵", "灵品"), ("玄", "玄品"), ("天", "天品")):
        by_rarity[name] = (await db.execute(
            select(func.count(Character.id)).where(Character.rarity == key)
        )).scalar_one()

    logs = (await db.execute(
        select(LogEntry).order_by(desc(LogEntry.id)).limit(10)
    )).scalars().all()

    return {
        "totals": {
            "characters": total_chars,
            "sessions": total_sessions,
            "active": active,
            "avg_load": avg_load,
        },
        "by_rarity": by_rarity,
        "recent_chars": [brief(c) for c in chars],
        "recent_sessions": [{
            "id": s.id,
            "code": s.code,
            "character_id": s.character_id,
            "character_name": names.get(s.character_id, "?"),
            "scenario_name": scenario_names.get(s.scenario_id, s.scenario_id),
            "status": s.status,
            "corruption": int((s.state or {}).get("corruption", 0)),
            "created_at": stamp(s.created_at),
        } for s in sessions],
        "logs": [{
            "seq": l.seq, "kind": l.kind, "severity": l.severity, "text": l.text,
        } for l in logs],
    }


@router.get("/game/map")
async def api_game_map(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(Character.city, func.count(Character.id)).group_by(Character.city)
    )).all()
    people = {city: count for city, count in rows}

    out = []
    for city in world.CITIES:
        lat, lon = world.geo_of(city["id"])
        fixed = [m for m in missions_mod.MISSIONS if city["id"] in m.get("cities", [])]
        out.append({
            "id": city["id"],
            "name": city["name"],
            "tier": city["tier"],
            "tier_name": world.TIER_BY_KEY[city["tier"]]["name"],
            "nation": city["nation"],
            "lat": lat,
            "lon": lon,
            "people": people.get(city["id"], 0),
            "missions": len(fixed),
            "factions": len(world.factions_of(city["id"])),
        })
    return {"cities": out}


@router.get("/game/city/{city_id}")
async def api_game_city(city_id: str, db: AsyncSession = Depends(get_db)):
    city = world.CITY_BY_ID.get(city_id)
    if not city:
        raise HTTPException(404, "没有这个城市")

    people = (await db.execute(
        select(Character).where(Character.city == city_id)
        .order_by(desc(Character.difficulty)).limit(8)
    )).scalars().all()

    fixed = [m for m in missions_mod.MISSIONS if city_id in m.get("cities", [])]
    samples = mission_engine.preview(city_id, 3)

    return {
        "city": city_payload(city),
        "missions": fixed,
        "random_missions": samples,
        "people": [brief(p) for p in people],
        "factions": world.factions_of(city_id),
    }
