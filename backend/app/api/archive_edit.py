"""档案编辑接口。

职责：
    给档案页提供增删改：把内容写回 data/content/*.json，删之前查数据库里的引用。
为什么需要：
    编辑要动磁盘上的设定文件，这个口子必须收在一处；和读接口一样走 /api，
    前端就不用知道文件在哪、也不用在浏览器里拼路径。
上下游：
    上游：前端档案页（ArchiveEditor）；下游：app/content/edit、app/models（人物引用检查）。
"""


from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..content import edit
from ..models import Character, get_db

router = APIRouter(prefix="/api/archive", tags=["archive-edit"])


@router.get("/kinds")
async def api_edit_kinds():
    """编辑器要知道哪些类别可写——和只读档案用同一套 key。"""
    return {"kinds": edit.kinds()}


@router.post("/{kind}")
async def api_create(kind: str, body: dict = Body(...)):
    payload = body.get("item") if isinstance(body.get("item"), dict) else body
    try:
        item = edit.create(kind, payload)
    except edit.EditError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "kind": kind, "item": item, "count": edit.count(kind)}


@router.put("/{kind}/{item_id}")
async def api_update(kind: str, item_id: str, body: dict = Body(...)):
    payload = body.get("item") if isinstance(body.get("item"), dict) else body
    try:
        item = edit.update(kind, item_id, payload)
    except edit.EditError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "kind": kind, "item": item}


@router.delete("/{kind}/{item_id}")
async def api_remove(kind: str, item_id: str, db: AsyncSession = Depends(get_db)):
    try:
        # 内容层看不到数据库，先把「有没有人物在用」查出来再交给它一起判断
        extra = await _character_refs(kind, item_id, db)
        item = edit.remove(kind, item_id, extra)
    except edit.EditError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "kind": kind, "item": item, "count": edit.count(kind)}


async def _character_refs(kind: str, item_id: str, db: AsyncSession) -> list[str]:
    """人物对内容的引用：城市、特性。

    为什么需要：
        设定是第一公民，但「谁在用它」这件事只有数据库知道；不查就会删出孤儿数据。
    """
    if kind == "cities":
        total = (await db.execute(
            select(func.count()).select_from(Character).where(Character.city == item_id)
        )).scalar_one()
        if total:
            return ["还有 %d 个人物登记在这座城市" % total]
        return []

    if kind == "traits":
        rows = (await db.execute(select(Character.name, Character.traits))).all()
        hits = [name for name, traits in rows
                if any(_trait_name(row) == item_id for row in (traits or []))]
        if hits:
            return ["还有 %d 个人物带着这个特性（%s）" % (len(hits), "、".join(hits[:3]))]
        return []

    return []


def _trait_name(row) -> str:
    """人物身上的特性可能是字符串，也可能是 {name, desc} 对象。"""
    return row.get("name", "") if isinstance(row, dict) else str(row)
