"""FastAPI 入口：JSON 接口 + Vue SPA。

前端是 frontend/ 下的 Vite + Vue 单页应用，构建产物挂在 /。
对外看起来是一套「边缘节点运控台」，实际是跑团。

页面路由全交给前端，后端只提供 /api/*。
"""

from __future__ import annotations

import datetime as dt
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import FRONTEND_DIST, ROOT, settings
from .content import (bestiary, events as events_mod, missions as missions_mod,
                      scenario as scenario_mod, shop, spirits, talismans,
                      traits as traits_mod, world)
from .db import get_db, init_models
from .engine import gacha, mission as mission_engine, npc, progress, sheet
from .engine.dice import Roller, new_seed
from .engine import session as engine
from .models import Character, LogEntry, PlaySession

PLATFORM = "玄武 · 边缘节点运控台"
DIST = FRONTEND_DIST


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.auto_create_tables:
        await init_models()
    yield


app = FastAPI(title=PLATFORM, lifespan=lifespan, docs_url="/api/docs")


# ---------------------------------------------------------------- 请求体

class GachaIn(BaseModel):
    count: int = 1


class BuyIn(BaseModel):
    item_id: str


class SessionIn(BaseModel):
    character_id: int
    scenario_id: str


class ActIn(BaseModel):
    action: str


class NpcIn(BaseModel):
    count: int = 1
    city: str | None = None
    mission: str | None = None


class PlayerIn(BaseModel):
    name: str
    school: str
    element: str
    city: str = "nanyu"
    attrs: dict[str, int] = {}
    events: list[str] = []
    notes: str = ""


class RandomSessionIn(BaseModel):
    character_id: int
    city: str | None = None


# ---------------------------------------------------------------- 组装

def _card(ch: Character) -> dict:
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


def _brief(ch: Character) -> dict:
    stats = sheet.derived(_card(ch))
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


def _stamp(value: dt.datetime | None) -> str:
    return value.strftime("%m-%d %H:%M") if value else ""


# ---------------------------------------------------------------- 总览 / 名录

@app.get("/api/dashboard")
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
        "recent_chars": [_brief(c) for c in chars],
        "recent_sessions": [{
            "id": s.id,
            "code": s.code,
            "character_id": s.character_id,
            "character_name": names.get(s.character_id, "?"),
            "scenario_name": scenario_names.get(s.scenario_id, s.scenario_id),
            "status": s.status,
            "corruption": int((s.state or {}).get("corruption", 0)),
            "created_at": _stamp(s.created_at),
        } for s in sessions],
        "logs": [{
            "seq": l.seq, "kind": l.kind, "severity": l.severity, "text": l.text,
        } for l in logs],
    }


@app.get("/api/roster")
async def api_roster(db: AsyncSession = Depends(get_db)):
    chars = (await db.execute(select(Character).order_by(desc(Character.id)))).scalars().all()
    return {
        "rows": [_brief(c) for c in chars],
        "rate": gacha.rate_table(),
    }


# ---------------------------------------------------------------- 世界层

@app.get("/api/world")
async def api_world():
    return {
        "nations": world.NATIONS,
        "sects": world.SECTS,
        "agencies": world.AGENCIES,
        "figures": world.FIGURES,
        "industries": world.INDUSTRIES,
        "tiers": world.CITY_TIERS,
        "cities": [{
            **city,
            "tier_name": world.TIER_BY_KEY[city["tier"]]["name"],
            "max_events": world.max_events(city["id"]),
            "industry_names": [world.industry_name(i) for i in city["industries"]],
            "nation_name": world.NATION_BY_ID.get(city["nation"], {}).get("name", city["nation"]),
        } for city in world.CITIES],
    }


@app.get("/api/events")
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


@app.get("/api/missions")
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


@app.get("/api/missions/random")
async def api_random_missions(city: str = "nanyu", count: int = 3):
    if city not in world.CITY_BY_ID:
        raise HTTPException(404, "没有这个城市")
    return {"city": city, "samples": mission_engine.preview(city, count)}


@app.post("/api/npcs")
async def api_npcs(body: NpcIn, db: AsyncSession = Depends(get_db)):
    count = max(1, min(10, body.count))
    made = []
    for _ in range(count):
        card = npc.roll_npc(city_id=body.city, mission_id=body.mission)
        ch = Character(**{
            "code": card["code"], "name": card["name"], "school": card["school"],
            "element": card["element"], "rarity": card["rarity"], "rank": card["rank"],
            "merit": card["merit"], "attrs": card["attrs"], "traits": card["traits"],
            "approval": card["approval"], "notes": card["notes"], "seed": card["seed"],
            "kind": card["kind"], "city": card["city"], "events": card["events"],
            "mission": card["mission"], "difficulty": card["difficulty"],
            "reward": card["reward"],
        })
        db.add(ch)
        await db.flush()
        made.append(_brief(ch))
    await db.commit()
    return {"created": len(made), "people": made}


@app.post("/api/characters/roll")
async def api_roll_attrs():
    """掷一套玩家属性：随机掷 + 随机补点，总值恒为 72。"""
    return npc.roll_player_attrs()


@app.post("/api/characters")
async def api_create_player(body: PlayerIn, db: AsyncSession = Depends(get_db)):
    try:
        card = npc.build_player(body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    ch = Character(
        code=card["code"], name=card["name"], school=card["school"],
        element=card["element"], rarity=card["rarity"], rank=card["rank"],
        merit=card["merit"], attrs=card["attrs"], traits=card["traits"],
        approval=card["approval"], notes=card["notes"], seed=card["seed"],
        kind=card["kind"], city=card["city"], events=card["events"],
        mission=card["mission"], difficulty=card["difficulty"], reward=card["reward"],
    )
    db.add(ch)
    await db.commit()
    await db.refresh(ch)
    return {"id": ch.id, "code": ch.code, "brief": _brief(ch)}


# ---------------------------------------------------------------- 角色

@app.post("/api/gacha")
async def api_gacha(body: GachaIn, db: AsyncSession = Depends(get_db)):
    count = max(1, min(10, body.count))
    made = []
    for card in gacha.roll_many(count):
        ch = Character(
            code=card["code"], name=card["name"], school=card["school"],
            element=card["element"], rarity=card["rarity"], rank=card["rank"],
            merit=card["merit"], attrs=card["attrs"], traits=card["traits"],
            approval=card["approval"], notes=card["notes"], seed=card["seed"],
        )
        db.add(ch)
        made.append({
            "code": card["code"], "name": card["name"], "school": card["school"],
            "element": card["element"], "rarity": card["rarity"], "rank": card["rank"],
        })
    await db.commit()
    return {"created": len(made), "cards": made}


@app.delete("/api/characters/{char_id}")
async def api_delete_character(char_id: int, db: AsyncSession = Depends(get_db)):
    ch = await db.get(Character, char_id)
    if not ch:
        raise HTTPException(404, "没有这个节点")
    await db.delete(ch)
    await db.commit()
    return {"ok": True}


@app.get("/api/characters/{char_id}")
async def api_character(char_id: int, db: AsyncSession = Depends(get_db)):
    ch = await db.get(Character, char_id)
    if not ch:
        raise HTTPException(404, "没有这个节点")

    card = _card(ch)
    stats = sheet.derived(card)
    scenario_names = {s["id"]: s["name"] for s in scenario_mod.SCENARIOS}

    sessions = (await db.execute(
        select(PlaySession).where(PlaySession.character_id == char_id)
        .order_by(desc(PlaySession.id))
    )).scalars().all()

    owned = {i["id"]: int(i.get("qty", 1)) for i in (ch.items or [])}
    shelf = []
    for item in shop.visible(ch.rank):
        shelf.append({
            **item,
            "owned": owned.get(item["id"], 0),
            "afford": int(ch.merit) >= int(item["price"]),
            "full": owned.get(item["id"], 0) >= int(item.get("max_qty", 1)),
            "corrupt": bool(item.get("corrupt")),
        })

    return {
        "id": ch.id,
        "code": ch.code,
        "name": ch.name,
        "kind": ch.kind or "npc",
        "city": {
            "id": ch.city,
            "name": world.CITY_BY_ID.get(ch.city, {}).get("name", ch.city),
            "tier": world.CITY_BY_ID.get(ch.city, {}).get("tier", ""),
            "tier_name": world.TIER_BY_KEY.get(
                world.CITY_BY_ID.get(ch.city, {}).get("tier", ""), {}).get("name", ""),
        },
        "events": [{
            "id": e["id"], "name": e["name"], "grade": e["grade"],
            "grade_name": events_mod.grade_name(e["grade"]),
            "text": e["text"], "hook": e["hook"], "traits": e.get("traits", []),
        } for e in (events_mod.get(eid) for eid in (ch.events or [])) if e],
        "difficulty": ch.difficulty,
        "reward": ch.reward,
        "school": ch.school,
        "school_name": sheet.SCHOOLS.get(ch.school, {}).get("name", ch.school),
        "tagline": sheet.SCHOOLS.get(ch.school, {}).get("tagline", ""),
        "element": ch.element,
        "rarity": ch.rarity,
        "rank": ch.rank,
        "merit": ch.merit,
        "karma_debt": ch.karma_debt or 0,
        "completed_sessions": ch.completed_sessions or 0,
        "notes": ch.notes,
        "seed": ch.seed,
        "attrs": sheet.display_attrs(card),
        "skills": [{"id": k, "name": v[0], "value": stats["skills"][k]}
                   for k, v in sheet.SKILLS.items()],
        "stats": stats,
        "traits": ch.traits or [],
        "items": ch.items or [],
        "ascensions": ch.ascensions or [],
        "spirits": [{
            "id": s["id"], "name": s["name"], "title": s["title"],
            "element": s["element"], "rank": s["rank"], "cost": s["cost"],
            "approval": int((ch.approval or {}).get(s["id"], 0)),
        } for s in spirits.available(ch.rank)],
        "missions": [{
            "id": s["id"], "code": s["code"], "name": s["name"], "brief": s["brief"],
        } for s in scenario_mod.SCENARIOS],
        "sessions": [{
            "id": s.id, "code": s.code, "status": s.status,
            "scenario_name": scenario_names.get(s.scenario_id, s.scenario_id),
            "corruption": int((s.state or {}).get("corruption", 0)),
        } for s in sessions],
        "progress": {
            "next_rank": progress.next_rank(ch.rank),
            "promotable": progress.promotable(card),
            "reqs": progress.requirements(card),
            "trial_attempts": ch.trial_attempts or 0,
            "trial_passed": bool(ch.mind_trial_passed),
        },
        "shelf": shelf,
    }


@app.post("/api/characters/{char_id}/promote")
async def api_promote(char_id: int, db: AsyncSession = Depends(get_db)):
    ch = await db.get(Character, char_id)
    if not ch:
        raise HTTPException(404, "没有这个节点")
    card = _card(ch)
    try:
        result = progress.promote(card)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    ch.rank = result["to"]
    ch.approval = card["approval"]
    ch.ascensions = list(ch.ascensions or []) + [{
        "from": result["from"],
        "to": result["to"],
        "opened": result["opened"],
        "at": dt.datetime.now().isoformat(timespec="seconds"),
    }]
    await db.commit()
    return {"ok": True, **result}


@app.post("/api/characters/{char_id}/trial")
async def api_trial(char_id: int, db: AsyncSession = Depends(get_db)):
    ch = await db.get(Character, char_id)
    if not ch:
        raise HTTPException(404, "没有这个节点")
    card = _card(ch)
    result = progress.trial(card, seed="trial-%d-%d" % (ch.id, (ch.trial_attempts or 0) + 1))
    ch.trial_attempts = (ch.trial_attempts or 0) + 1
    if result["passed"]:
        ch.mind_trial_passed = True
    await db.commit()
    return {"ok": True, **result}


@app.post("/api/characters/{char_id}/buy")
async def api_buy(char_id: int, body: BuyIn, db: AsyncSession = Depends(get_db)):
    ch = await db.get(Character, char_id)
    if not ch:
        raise HTTPException(404, "没有这个节点")
    card = _card(ch)
    try:
        result = progress.buy(card, body.item_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    ch.merit = card["merit"]
    ch.items = card["items"]
    ch.karma_debt = card.get("karma_debt", ch.karma_debt)
    await db.commit()
    return {"ok": True, **result}


# ---------------------------------------------------------------- 内容

@app.get("/api/scenarios")
async def api_scenarios():
    return {
        "scenarios": scenario_mod.SCENARIOS,
        "bestiary": bestiary.BESTIARY,
        "talismans": talismans.TALISMANS,
        "spirits": spirits.SPIRITS,
        "shop": shop.ITEMS,
    }


# ---------------------------------------------------------------- 会话

async def _create_session(db: AsyncSession, character_id: int, scenario_id: str) -> PlaySession:
    ch = await db.get(Character, character_id)
    if not ch:
        raise HTTPException(404, "没有这个节点")
    scenario = scenario_mod.get(scenario_id)
    if not scenario:
        raise HTTPException(404, "没有这个作业手册")

    state = engine.new_state(_card(ch), scenario)
    seq = (await db.execute(select(func.count(PlaySession.id)))).scalar_one() + 1
    ses = PlaySession(
        code="%s-%03d" % (scenario["code"], seq),
        character_id=ch.id,
        scenario_id=scenario_id,
        status="active",
        state=state,
        seed=state["seed"],
    )
    db.add(ses)
    await db.flush()

    opening = scenario["scenes"][0]
    db.add(LogEntry(
        session_id=ses.id, seq=1, kind="scene", severity="info",
        text="接入：%s｜%s" % (opening.get("place", ""), opening["name"]),
        payload={},
    ))
    await db.commit()
    return ses


@app.post("/api/sessions")
async def api_start_session(body: SessionIn, db: AsyncSession = Depends(get_db)):
    ses = await _create_session(db, body.character_id, body.scenario_id)
    return {"id": ses.id, "code": ses.code}


@app.post("/api/sessions/random")
async def api_start_random(body: RandomSessionIn, db: AsyncSession = Depends(get_db)):
    """随机任务：城市 + 事件现场拼一场，场景流存进会话状态里。"""
    ch = await db.get(Character, body.character_id)
    if not ch:
        raise HTTPException(404, "没有这个节点")

    city_id = body.city
    if city_id and city_id not in world.CITY_BY_ID:
        raise HTTPException(404, "没有这个城市")
    if not city_id:
        city_id = npc.pick_city(Roller(seed=new_seed()))["id"]

    mission = mission_engine.generate(city_id)
    scenario = mission["scenario"]
    state = engine.new_state(_card(ch), scenario)
    state["scenario"] = scenario
    state["mission"] = {k: mission[k] for k in
                        ("id", "name", "difficulty", "reward", "grade", "city_name")}

    seq = (await db.execute(select(func.count(PlaySession.id)))).scalar_one() + 1
    ses = PlaySession(
        code="%s-%03d" % (mission["code"], seq),
        character_id=ch.id,
        scenario_id=mission["id"],
        status="active",
        state=state,
        seed=mission["seed"],
    )
    db.add(ses)
    await db.flush()
    db.add(LogEntry(
        session_id=ses.id, seq=1, kind="scene", severity="info",
        text="接入随机任务：%s｜难度 %d（%s）｜报酬 %d" % (
            mission["name"], mission["difficulty"], mission["grade"], mission["reward"]),
        payload={},
    ))
    await db.commit()
    return {
        "id": ses.id, "code": ses.code, "mission_id": mission["id"],
        "name": mission["name"], "difficulty": mission["difficulty"],
        "reward": mission["reward"],
    }


@app.get("/api/sessions/{session_id}")
async def api_session(session_id: int, db: AsyncSession = Depends(get_db)):
    ses = await db.get(PlaySession, session_id)
    if not ses:
        raise HTTPException(404, "没有这个处置会话")
    ch = await db.get(Character, ses.character_id)
    scenario = (ses.state or {}).get("scenario") or scenario_mod.get(ses.scenario_id)
    card = _card(ch)
    logs = (await db.execute(
        select(LogEntry).where(LogEntry.session_id == ses.id).order_by(LogEntry.seq)
    )).scalars().all()

    return {
        "id": ses.id,
        "code": ses.code,
        "status": ses.status,
        "character": {"id": ch.id, "code": ch.code, "name": ch.name},
        "scenario": {"id": scenario["id"], "code": scenario["code"], "name": scenario["name"]},
        "view": engine.view(card, scenario, ses.state or {}),
        "logs": [{
            "kind": l.kind, "severity": l.severity, "text": l.text,
        } for l in logs],
    }


@app.post("/api/sessions/{session_id}/act")
async def api_act(session_id: int, body: ActIn, db: AsyncSession = Depends(get_db)):
    ses = await db.get(PlaySession, session_id)
    if not ses:
        raise HTTPException(404, "没有这个处置会话")
    ch = await db.get(Character, ses.character_id)
    scenario = (ses.state or {}).get("scenario") or scenario_mod.get(ses.scenario_id)
    card = _card(ch)

    state = dict(ses.state or {})
    was_done = ses.status == "done"
    state, events = engine.act(card, scenario, state, body.action)
    ses.state = state
    ses.status = "done" if state.get("status") == "done" else "active"

    last = (await db.execute(
        select(func.max(LogEntry.seq)).where(LogEntry.session_id == ses.id)
    )).scalar()
    seq = (last or 0) + 1
    for ev in events:
        db.add(LogEntry(
            session_id=ses.id, seq=seq, kind=ev["kind"],
            severity=ev["severity"], text=ev["text"], payload=ev.get("payload", {}),
        ))
        seq += 1

    ending = state.get("ending")
    if ending and not was_done:
        ch.merit = (ch.merit or 0) + int(ending.get("merit_award", 0))
        ch.completed_sessions = (ch.completed_sessions or 0) + 1
        karma = ending.get("karma") or []
        ch.karma_good = (ch.karma_good or 0) + sum(1 for k in karma if k == "善")
        ch.karma_debt = (ch.karma_debt or 0) + sum(1 for k in karma if k == "阴债")

    await db.commit()
    return {
        "events": events,
        "status": ses.status,
        "view": engine.view(card, scenario, state),
    }


# ---------------------------------------------------------------- 静态站点

if (DIST / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=str(DIST / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse({"detail": "接口不存在"}, status_code=404)
        target = DIST / full_path
        if full_path and target.is_file():
            return FileResponse(target)
        return FileResponse(DIST / "index.html")

else:
    @app.get("/", include_in_schema=False)
    async def not_built():
        return JSONResponse(
            {"detail": "前端还没构建：cd frontend && npm install && npm run build"},
            status_code=503,
        )


def run() -> None:
    import uvicorn

    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=False)
