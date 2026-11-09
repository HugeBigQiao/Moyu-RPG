"""ORM 实体。

职责：
    定义三张表：characters（人物）、sessions（一局）、session_logs（事件流）。
为什么需要：
    只把「会变的状态」入库；设定是内容（data/content/*.json），不进库，
    这样内容能 diff、能回滚，状态也不会被内容版本绑死。
上下游：
    上游 app/models/base.py（Base、JSON 类型）；
    下游 app/api/*（读写）、data/migrations（建表）。
"""

from __future__ import annotations

import datetime as dt

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base

# PG 存 JSONB，SQLite / MySQL 存 JSON —— 一份模型吃三个方言
JSONType = JSON().with_variant(JSONB(), "postgresql")


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


class Character(Base):
    """一张角色卡。名字和代号都是「纳管后自动生成」的，可以重抽。"""

    __tablename__ = "characters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(32))
    school: Mapped[str] = mapped_column(String(16), index=True)
    element: Mapped[str] = mapped_column(String(8))
    rarity: Mapped[str] = mapped_column(String(8), index=True)
    rank: Mapped[str] = mapped_column(String(8), default="初真")
    merit: Mapped[int] = mapped_column(Integer, default=0)
    attrs: Mapped[dict] = mapped_column(JSONType, default=dict)
    traits: Mapped[list] = mapped_column(JSONType, default=list)
    approval: Mapped[dict] = mapped_column(JSONType, default=dict)
    notes: Mapped[str] = mapped_column(Text, default="")
    seed: Mapped[str] = mapped_column(String(32), default="")

    # ---- 世界层：这个人从哪来、身上带着什么事件 ----
    kind: Mapped[str] = mapped_column(String(8), default="npc", index=True)  # player / npc
    city: Mapped[str] = mapped_column(String(16), default="nanyu", index=True)
    events: Mapped[list] = mapped_column(JSONType, default=list)
    mission: Mapped[str | None] = mapped_column(String(24), nullable=True)
    difficulty: Mapped[int] = mapped_column(Integer, default=1)
    reward: Mapped[int] = mapped_column(Integer, default=5)

    # ---- 成长线 ----
    completed_sessions: Mapped[int] = mapped_column(Integer, default=0)
    karma_good: Mapped[int] = mapped_column(Integer, default=0)
    karma_debt: Mapped[int] = mapped_column(Integer, default=0)
    mind_trial_passed: Mapped[bool] = mapped_column(Boolean, default=False)
    trial_attempts: Mapped[int] = mapped_column(Integer, default=0)
    items: Mapped[list] = mapped_column(JSONType, default=list)
    ascensions: Mapped[list] = mapped_column(JSONType, default=list)

    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_now)

    sessions: Mapped[list["PlaySession"]] = relationship(back_populates="character")


class PlaySession(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    character_id: Mapped[int] = mapped_column(ForeignKey("characters.id", ondelete="CASCADE"))
    scenario_id: Mapped[str] = mapped_column(String(24), index=True)
    status: Mapped[str] = mapped_column(String(12), default="active", index=True)
    state: Mapped[dict] = mapped_column(JSONType, default=dict)
    seed: Mapped[str] = mapped_column(String(32), default="")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=func.now()
    )

    character: Mapped[Character] = relationship(back_populates="sessions")
    logs: Mapped[list["LogEntry"]] = relationship(
        back_populates="session", order_by="LogEntry.seq", cascade="all, delete-orphan"
    )


class LogEntry(Base):
    """事件流。UI 上伪装成告警流，实际就是跑团记录。"""

    __tablename__ = "session_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), index=True
    )
    seq: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(16), default="info")
    severity: Mapped[str] = mapped_column(String(8), default="info")
    text: Mapped[str] = mapped_column(Text)
    payload: Mapped[dict] = mapped_column(JSONType, default=dict)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_now)

    session: Mapped[PlaySession] = relationship(back_populates="logs")
