"""API 板块。

    app/api/
      schemas.py     请求体
      common.py      ORM → dict、列表摘要、城市视图
      archive.py     世界 / 事件 / 任务 / 装备 / 特性 / 内容热重载
      game.py        总览 / 地图 / 城市面板
      characters.py  名录 / 生成 / 自建 / 角色卡 / 成长线
      sessions.py    开团 / 取状态 / 行动

前端只认 /api/*，页面路由由 SPA 自己管。
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
