"""运行时配置。

职责：
    读环境变量与 .env，给出数据库连接串、监听地址、前端产物路径。
为什么需要：
    所有需要「知道连哪、跑在哪」的模块都从这里取，避免口令散落。
上下游：
    上游：.env / 环境变量；下游：models/base、main、data/migrations/env。
"""


from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parent.parent      # backend/
PROJECT = ROOT.parent                               # 仓库根，frontend/ 在这下面
FRONTEND_DIST = PROJECT / "frontend" / "dist"
DATA_DIR = ROOT / "data"                            # SQLite 文件落这里
DATA_DIR.mkdir(parents=True, exist_ok=True)

# 默认 SQLite；要换 PG / MySQL 就改 MOYU_DATABASE_URL，代码不用动。
DEFAULT_DATABASE_URL = "sqlite+aiosqlite:///" + (DATA_DIR / "moyu.db").as_posix()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ROOT / ".env"),
        env_prefix="MOYU_",
        extra="ignore",
    )

    database_url: str = DEFAULT_DATABASE_URL
    host: str = "127.0.0.1"
    port: int = 8888
    auto_create_tables: bool = True
    page_size: int = 20

    @property
    def dialect(self) -> str:
        for name in ("sqlite", "postgresql", "mysql"):
            if self.database_url.startswith(name):
                return name
        return "unknown"


settings = Settings()

# SQLite 的相对路径一律钉到 backend/ 下：不然从别的目录启动会连到另一个库。
if settings.database_url.startswith("sqlite") and ":///" in settings.database_url:
    prefix, _, tail = settings.database_url.partition(":///")
    is_abs = tail.startswith("/") or (len(tail) > 1 and tail[1] == ":")
    if not is_abs:
        settings.database_url = "%s:///%s" % (prefix, (ROOT / tail).as_posix())


def sync_dsn(url: str | None = None) -> str:
    """给同步工具（alembic / psql）用的 DSN。"""
    raw = url or settings.database_url
    return raw.replace("+asyncpg", "").replace("+aiosqlite", "")
