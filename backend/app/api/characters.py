"""人物接口：名录、随机生成、玩家自建、角色卡、成长线。"""

from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..content import (events as events_mod, scenario as scenario_mod, shop,
                       spirits, world)
from ..db import get_db
from ..engine import gacha, npc, progress, sheet
from ..models import Character, PlaySession
from .common import brief, card
from .schemas import BuyIn, GachaIn, NpcIn, PlayerIn

router = APIRouter(prefix="/api", tags=["characters"])


@router.get("/roster")
async def api_roster(db: AsyncSession = Depends(get_db)):
    chars = (await db.execute(select(Character).order_by(desc(Character.id)))).scalars().all()
    return {"rows": [brief(c) for c in chars], "rate": gacha.rate_table()}


@router.post("/npcs")
async def api_npcs(body: NpcIn, db: AsyncSession = Depends(get_db)):
    count = max(1, min(10, body.count))
    made = []
    for _ in range(count):
        built = npc.roll_npc(city_id=body.city, mission_id=body.mission)
        ch = Character(**{
            "code": built["code"], "name": built["name"], "school": built["school"],
            "element": built["element"], "rarity": built["rarity"], "rank": built["rank"],
            "merit": built["merit"], "attrs": built["attrs"], "traits": built["traits"],
            "approval": built["approval"], "notes": built["notes"], "seed": built["seed"],
            "kind": built["kind"], "city": built["city"], "events": built["events"],
            "mission": built["mission"], "difficulty": built["difficulty"],
            "reward": built["reward"],
        })
        db.add(ch)
        await db.flush()
        made.append(brief(ch))
    await db.commit()
    return {"created": len(made), "people": made}


@router.post("/characters/roll")
async def api_roll_attrs():
    """掷一套玩家属性：随机掷 + 随机补点，总值恒为 72。"""
    return npc.roll_player_attrs()


@router.post("/characters")
async def api_create_player(body: PlayerIn, db: AsyncSession = Depends(get_db)):
    try:
        built = npc.build_player(body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    ch = Character(
        code=built["code"], name=built["name"], school=built["school"],
        element=built["element"], rarity=built["rarity"], rank=built["rank"],
        merit=built["merit"], attrs=built["attrs"], traits=built["traits"],
        approval=built["approval"], notes=built["notes"], seed=built["seed"],
        kind=built["kind"], city=built["city"], events=built["events"],
        mission=built["mission"], difficulty=built["difficulty"], reward=built["reward"],
    )
    db.add(ch)
    await db.commit()
    await db.refresh(ch)
    return {"id": ch.id, "code": ch.code, "brief": brief(ch)}


@router.post("/gacha")
async def api_gacha(body: GachaIn, db: AsyncSession = Depends(get_db)):
    count = max(1, min(10, body.count))
    made = []
    for built in gacha.roll_many(count):
        ch = Character(
            code=built["code"], name=built["name"], school=built["school"],
            element=built["element"], rarity=built["rarity"], rank=built["rank"],
            merit=built["merit"], attrs=built["attrs"], traits=built["traits"],
            approval=built["approval"], notes=built["notes"], seed=built["seed"],
        )
        db.add(ch)
        made.append({
            "code": built["code"], "name": built["name"], "school": built["school"],
            "element": built["element"], "rarity": built["rarity"], "rank": built["rank"],
        })
    await db.commit()
    return {"created": len(made), "cards": made}


@router.delete("/characters/{char_id}")
async def api_delete_character(char_id: int, db: AsyncSession = Depends(get_db)):
    ch = await db.get(Character, char_id)
    if not ch:
        raise HTTPException(404, "没有这个节点")
    await db.delete(ch)
    await db.commit()
    return {"ok": True}


@router.get("/characters/{char_id}")
async def api_character(char_id: int, db: AsyncSession = Depends(get_db)):
    ch = await db.get(Character, char_id)
    if not ch:
        raise HTTPException(404, "没有这个节点")

    payload = card(ch)
    stats = sheet.derived(payload)
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
        "attrs": sheet.display_attrs(payload),
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
            "promotable": progress.promotable(payload),
            "reqs": progress.requirements(payload),
            "trial_attempts": ch.trial_attempts or 0,
            "trial_passed": bool(ch.mind_trial_passed),
        },
        "shelf": shelf,
    }


@router.post("/characters/{char_id}/promote")
async def api_promote(char_id: int, db: AsyncSession = Depends(get_db)):
    ch = await db.get(Character, char_id)
    if not ch:
        raise HTTPException(404, "没有这个节点")
    payload = card(ch)
    try:
        result = progress.promote(payload)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    ch.rank = result["to"]
    ch.approval = payload["approval"]
    ch.ascensions = list(ch.ascensions or []) + [{
        "from": result["from"],
        "to": result["to"],
        "opened": result["opened"],
        "at": dt.datetime.now().isoformat(timespec="seconds"),
    }]
    await db.commit()
    return {"ok": True, **result}


@router.post("/characters/{char_id}/trial")
async def api_trial(char_id: int, db: AsyncSession = Depends(get_db)):
    ch = await db.get(Character, char_id)
    if not ch:
        raise HTTPException(404, "没有这个节点")
    result = progress.trial(card(ch), seed="trial-%d-%d" % (ch.id, (ch.trial_attempts or 0) + 1))
    ch.trial_attempts = (ch.trial_attempts or 0) + 1
    if result["passed"]:
        ch.mind_trial_passed = True
    await db.commit()
    return {"ok": True, **result}


@router.post("/characters/{char_id}/buy")
async def api_buy(char_id: int, body: BuyIn, db: AsyncSession = Depends(get_db)):
    ch = await db.get(Character, char_id)
    if not ch:
        raise HTTPException(404, "没有这个节点")
    payload = card(ch)
    try:
        result = progress.buy(payload, body.item_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    ch.merit = payload["merit"]
    ch.items = payload["items"]
    ch.karma_debt = payload.get("karma_debt", ch.karma_debt)
    await db.commit()
    return {"ok": True, **result}
