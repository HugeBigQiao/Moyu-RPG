"""会话接口：开团（固定 / 随机）、取状态、执行行动。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..content import scenario as scenario_mod, world
from ..db import get_db
from ..engine import mission as mission_engine, npc
from ..engine import session as engine
from ..engine.dice import Roller, new_seed
from ..models import Character, LogEntry, PlaySession
from .common import card
from .schemas import ActIn, RandomSessionIn, SessionIn

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


async def _next_seq(db: AsyncSession) -> int:
    total = (await db.execute(select(func.count(PlaySession.id)))).scalar_one()
    return total + 1


async def _create_fixed(db: AsyncSession, character_id: int, scenario_id: str) -> PlaySession:
    ch = await db.get(Character, character_id)
    if not ch:
        raise HTTPException(404, "没有这个节点")
    scenario = scenario_mod.get(scenario_id)
    if not scenario:
        raise HTTPException(404, "没有这个作业手册")

    state = engine.new_state(card(ch), scenario)
    ses = PlaySession(
        code="%s-%03d" % (scenario["code"], await _next_seq(db)),
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


@router.post("")
async def api_start_session(body: SessionIn, db: AsyncSession = Depends(get_db)):
    ses = await _create_fixed(db, body.character_id, body.scenario_id)
    return {"id": ses.id, "code": ses.code}


@router.post("/random")
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
    state = engine.new_state(card(ch), scenario)
    state["scenario"] = scenario
    state["mission"] = {k: mission[k] for k in
                        ("id", "name", "difficulty", "reward", "grade", "city_name")}

    ses = PlaySession(
        code="%s-%03d" % (mission["code"], await _next_seq(db)),
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


def _scenario_of(ses: PlaySession) -> dict:
    scenario = (ses.state or {}).get("scenario") or scenario_mod.get(ses.scenario_id)
    if not scenario:
        raise HTTPException(404, "这一局用的剧本已经不在了")
    return scenario


@router.get("/{session_id}")
async def api_session(session_id: int, db: AsyncSession = Depends(get_db)):
    ses = await db.get(PlaySession, session_id)
    if not ses:
        raise HTTPException(404, "没有这个处置会话")
    ch = await db.get(Character, ses.character_id)
    scenario = _scenario_of(ses)
    payload = card(ch)
    logs = (await db.execute(
        select(LogEntry).where(LogEntry.session_id == ses.id).order_by(LogEntry.seq)
    )).scalars().all()

    return {
        "id": ses.id,
        "code": ses.code,
        "status": ses.status,
        "character": {"id": ch.id, "code": ch.code, "name": ch.name},
        "scenario": {"id": scenario["id"], "code": scenario["code"], "name": scenario["name"]},
        "view": engine.view(payload, scenario, ses.state or {}),
        "logs": [{"kind": l.kind, "severity": l.severity, "text": l.text} for l in logs],
    }


@router.post("/{session_id}/act")
async def api_act(session_id: int, body: ActIn, db: AsyncSession = Depends(get_db)):
    ses = await db.get(PlaySession, session_id)
    if not ses:
        raise HTTPException(404, "没有这个处置会话")
    ch = await db.get(Character, ses.character_id)
    scenario = _scenario_of(ses)
    payload = card(ch)

    state = dict(ses.state or {})
    was_done = ses.status == "done"
    state, events = engine.act(payload, scenario, state, body.action)
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
        "view": engine.view(payload, scenario, state),
    }
