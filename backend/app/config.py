"""运行时配置。

数据库口令按你给的就写在默认值里，但优先读环境变量，方便换机器。
"""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parent.parent      # backend/
PROJECT = ROOT.parent                               # 仓库根，frontend/ 在这下面
FRONTEND_DIST = PROJECT / "frontend" / "dist"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ROOT / ".env"),
        env_prefix="MOYU_",
        extra="ignore",
    )

    database_url: str = "postgresql+asyncpg://postgres:123456@127.0.0.1:5432/moyu_trpg"
    host: str = "127.0.0.1"
    port: int = 8770
    auto_create_tables: bool = True
    page_size: int = 20


settings = Settings()


def sync_dsn(url: str | None = None) -> str:
    """给同步工具（alembic/psql）用的 DSN。"""
    raw = url or settings.database_url
    return raw.replace("+asyncpg", "")
