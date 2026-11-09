"""模型层。

职责：
    统一出口：数据库连接、声明基类、ORM 实体。
为什么需要：
    让「持久化」只在一个地方被 import —— 上层写 `from app.models import Character`，
    不关心引擎怎么建的。
上下游：
    上游 app/config.py（连接串）；
    下游 app/api/*（读写）、data/migrations/env.py（迁移时拿 metadata）、
    scripts/migrate_db.py（跨库搬运）。
"""

from __future__ import annotations

from .base import Base, SessionLocal, engine, get_db, init_models
from .entities import Character, LogEntry, PlaySession

__all__ = [
    "Base",
    "SessionLocal",
    "engine",
    "get_db",
    "init_models",
    "Character",
    "PlaySession",
    "LogEntry",
]
