"""跨库搬数据：SQLite ⇄ PostgreSQL ⇄ MySQL。

    # PG → SQLite（默认目标就是 backend/data/moyu.db）
    uv run python scripts/migrate_db.py --from postgresql+asyncpg://postgres:123456@127.0.0.1:5432/moyu_trpg

    # SQLite → 新的 PG
    uv run python scripts/migrate_db.py --from auto --to postgresql+asyncpg://postgres:123456@127.0.0.1:5432/moyu_trpg

    # 只看会搬多少行，不写
    uv run python scripts/migrate_db.py --from ... --dry-run

目标库的表结构要先建好（cd backend && uv run alembic upgrade head）。
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from app.config import settings  # noqa: E402
from app.models import Base  # noqa: E402
import app.models  # noqa: E402,F401  注册表


def _resolve(url: str) -> str:
    return settings.database_url if url == "auto" else url


async def copy(src_url: str, dst_url: str, dry_run: bool) -> None:
    src = create_async_engine(src_url)
    dst = create_async_engine(dst_url)
    print("source:", src_url)
    print("target:", dst_url)

    total = 0
    async with src.connect() as s:
        async with dst.begin() as d:
            for table in Base.metadata.sorted_tables:
                rows = (await s.execute(select(table))).mappings().all()
                if not rows:
                    print("  %-16s 0" % table.name)
                    continue
                total += len(rows)
                print("  %-16s %d" % (table.name, len(rows)))
                if not dry_run:
                    await d.execute(table.insert(), [dict(r) for r in rows])
    print("合计 %d 行%s" % (total, "（dry-run，未写入）" if dry_run else ""))
    await src.dispose()
    await dst.dispose()


def main() -> int:
    ap = argparse.ArgumentParser(description="跨库搬数据")
    ap.add_argument("--from", dest="src", required=True, help="源库 URL，或 auto 表示当前配置")
    ap.add_argument("--to", dest="dst", default="auto", help="目标库 URL，默认当前配置")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    asyncio.run(copy(_resolve(args.src), _resolve(args.dst), args.dry_run))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
