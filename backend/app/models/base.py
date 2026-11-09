"""数据库连接与会话。

职责：
    建异步引擎、会话工厂、声明基类，并提供 FastAPI 的 get_db 依赖。
为什么需要：
    引擎与会话是全进程唯一的东西，必须集中创建；散落各处会导致连接泄漏、
    以及在 SQLite 上开出一堆文件句柄。
上下游：
    上游 app/config.py 提供连接串；下游 app/api/*（依赖注入）、
    app/models/entities.py（继承 Base）、data/migrations/env.py（迁移时复用）。
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from ..config import settings

IS_SQLITE = settings.database_url.startswith("sqlite")

_engine_kwargs: dict = {"echo": False, "pool_pre_ping": True}
if IS_SQLITE:
    # 单文件库用 NullPool：连接用完就关，避免长连接锁住文件
    _engine_kwargs["poolclass"] = NullPool

engine = create_async_engine(settings.database_url, **_engine_kwargs)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


if IS_SQLITE:
    @event.listens_for(engine.sync_engine, "connect")
    def _sqlite_pragmas(dbapi_connection, _record):
        """SQLite 连接建立时补两条 PRAGMA。

        参数：
            dbapi_connection：底层 DBAPI 连接（sqlite3 的 Connection）。
            _record：SQLAlchemy 的连接记录，本函数不用。
        为什么需要：
            SQLite 默认不校验外键，级联删除会静默失效；WAL 能让读写不互相阻塞。
        输出：
            无；副作用是设置了 foreign_keys 与 journal_mode。
        """
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


class Base(DeclarativeBase):
    """所有 ORM 实体的声明基类（metadata 的来源）。"""


async def get_db() -> AsyncIterator[AsyncSession]:
    """FastAPI 依赖：每个请求一个会话，请求结束自动关闭。

    参数：
        无（由 FastAPI 注入）。
    为什么需要：
        路由里不该自己 new 会话，否则异常路径容易漏关。
    输出：
        产出 AsyncSession 的异步生成器。
    """
    async with SessionLocal() as session:
        yield session


async def init_models() -> None:
    """直接按模型建表（仅用于「不想跑迁移」的本地快速启动）。

    参数：
        无。
    为什么需要：
        MOYU_AUTO_CREATE_TABLES=true 时，首次启动不必先跑 alembic。
    输出：
        无；副作用是在目标库建出缺失的表。
    """
    from . import entities  # noqa: F401  确保实体已注册到 Base.metadata

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
