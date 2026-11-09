"""API 板块聚合。

职责：
    把 archive / game / characters / sessions 四个 router 合成一个 api_router。
为什么需要：
    main.py 只需要 include 一次，新增板块只改这里。
上下游：
    上游：app/api/* 各模块；下游：main.py。
"""


from __future__ import annotations

from fastapi import APIRouter

from . import archive, characters, game, sessions

api_router = APIRouter()
api_router.include_router(archive.router)
api_router.include_router(game.router)
api_router.include_router(characters.router)
api_router.include_router(sessions.router)

__all__ = ["api_router"]
