"""把 app/content/*.py 里的数据导出成 backend/content/*.json。

一次性脚本：导出之后 content 模块就改成读 JSON 了，这个脚本只在需要
从旧版本迁移数据时用。

    uv run python scripts/export_content.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.content import (  # noqa: E402
    bestiary, equipment, events, missions, scenario, shop, spirits, talismans,
    traits, world,
)

OUT = ROOT / "content"


def dump(name: str, payload: dict) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / (name + ".json")
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print("%-14s %6d 字节" % (path.name, path.stat().st_size))


def main() -> int:
    dump("world", {
        "nations": world.NATIONS,
        "sects": world.SECTS,
        "agencies": world.AGENCIES,
        "figures": world.FIGURES,
        "industries": world.INDUSTRIES,
        "tiers": world.CITY_TIERS,
        "cities": world.CITIES,
        "city_geo": {k: list(v) for k, v in world.CITY_GEO.items()},
        "city_factions": world.CITY_FACTIONS,
        "lore": world.LORE,
    })
    dump("events", {"events": events.EVENTS, "grades": events.GRADE_INFO})
    dump("traits", {"traits": traits.TRAITS, "tiers": traits.TRAIT_TIERS})
    dump("missions", {"missions": missions.MISSIONS})
    dump("talismans", {"talismans": talismans.TALISMANS})
    dump("spirits", {"spirits": spirits.SPIRITS})
    dump("bestiary", {"bestiary": bestiary.BESTIARY})
    dump("equipment", {"equipment": equipment.EQUIPMENT})
    dump("shop", {"items": shop.ITEMS})
    dump("scenarios", {"scenarios": scenario.SCENARIOS})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
