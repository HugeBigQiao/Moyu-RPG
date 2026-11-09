"""内容层：JSON 文件、加载器、热重载。"""

from __future__ import annotations

import json

import pytest

from app.content import (bestiary, equipment, events, missions, scenario, shop,
                         spirits, talismans, traits, world)
from app.content._store import CONTENT_DIR, reload_all, status

REQUIRED = {
    "world": ("nations", "sects", "agencies", "figures", "industries",
              "tiers", "cities", "lore"),
    "events": ("events", "grades"),
    "traits": ("traits", "tiers"),
    "missions": ("missions",),
    "talismans": ("talismans",),
    "spirits": ("spirits",),
    "bestiary": ("bestiary",),
    "equipment": ("equipment",),
    "shop": ("items",),
    "scenarios": ("scenarios",),
}


def test_content_dir_exists_and_has_files():
    assert CONTENT_DIR.is_dir(), "缺少 backend/content 目录"
    names = {p.stem for p in CONTENT_DIR.glob("*.json")}
    assert set(REQUIRED) <= names, "缺少内容文件：%s" % (set(REQUIRED) - names)


@pytest.mark.parametrize("name", sorted(REQUIRED))
def test_json_is_valid_and_complete(name):
    data = json.loads((CONTENT_DIR / (name + ".json")).read_text(encoding="utf-8"))
    for key in REQUIRED[name]:
        assert key in data, "%s.json 缺少 %s" % (name, key)


def test_modules_loaded_from_json():
    assert len(world.CITIES) >= 10
    assert len(events.EVENTS) >= 50
    assert len(traits.TRAITS) >= 20
    assert len(talismans.TALISMANS) >= 10
    assert len(spirits.SPIRITS) >= 8
    assert len(bestiary.BESTIARY) >= 6
    assert len(equipment.EQUIPMENT) >= 15
    assert len(shop.ITEMS) >= 6
    assert len(scenario.SCENARIOS) >= 5
    assert len(missions.MISSIONS) >= 5


def test_indexes_rebuilt():
    assert world.CITY_BY_ID["nanyu"]["name"] == "南屿"
    assert events.EVENT_BY_ID
    assert traits.TRAITS["天眼"]["tier"] == 1
    assert missions.MISSION_BY_ID["mirror"]["scenario_id"] == "mirror"


def test_reload_is_idempotent():
    first = reload_all()
    second = reload_all()
    assert all(v == "ok" for v in first.values()), first
    assert first == second
    assert len(world.CITIES) >= 10


def test_status_reports_files():
    state = status()
    assert state["dir"].endswith("content")
    assert "world.json" in state["files"]
    assert not state["errors"]


def test_sheet_traits_follow_reload():
    """特性表是跨模块引用，重载后 sheet.TRAITS 必须跟着换。"""
    from app.engine import sheet

    before = sheet.TRAITS
    reload_all()
    assert sheet.TRAITS is traits.TRAITS
    assert sheet.TRAITS is not before or sheet.TRAITS == traits.TRAITS


def test_bad_json_raises(tmp_path, monkeypatch):
    """坏文件要报错，不能静默。"""
    from app.content import _store

    broken = tmp_path / "broken.json"
    broken.write_text("{ not json", encoding="utf-8")
    monkeypatch.setattr(_store, "CONTENT_DIR", tmp_path)
    with pytest.raises(_store.ContentError):
        _store.load("broken", force=True)
