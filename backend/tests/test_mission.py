"""随机任务与掷点的单测。"""

from __future__ import annotations

import pytest

from app.engine import mission, npc
from app.engine.npc import ATTR_KEYS, ATTR_MAX, ATTR_MIN, PLAYER_POINTS


# ---------------------------------------------------------------- 掷点

def test_roll_player_attrs_total_is_constant():
    for i in range(40):
        rolled = npc.roll_player_attrs("roll-%d" % i)
        assert rolled["total"] == PLAYER_POINTS
        assert sum(rolled["attrs"].values()) == PLAYER_POINTS


def test_roll_player_attrs_in_bounds():
    for i in range(40):
        attrs = npc.roll_player_attrs("bounds-%d" % i)["attrs"]
        for key in ATTR_KEYS:
            assert ATTR_MIN <= attrs[key] <= ATTR_MAX, (key, attrs[key])


def test_roll_player_attrs_deterministic_and_varied():
    a = npc.roll_player_attrs("same")["attrs"]
    b = npc.roll_player_attrs("same")["attrs"]
    assert a == b
    different = {tuple(npc.roll_player_attrs("v-%d" % i)["attrs"].items()) for i in range(8)}
    assert len(different) > 1, "不同种子应该掷出不同的配比"


def test_roll_player_attrs_is_not_flat():
    """不该永远是六项各 12 —— 掷点要真的掷出差异。"""
    attrs = npc.roll_player_attrs("spread")["attrs"]
    assert len(set(attrs.values())) > 1


def test_build_player_without_attrs_rolls():
    card = npc.build_player({
        "name": "无名", "school": "fulu", "element": "火", "city": "nanyu",
        "attrs": {}, "events": [],
    }, seed="auto-roll")
    assert sum(card["attrs"].values()) == PLAYER_POINTS


# ---------------------------------------------------------------- 稀有度

def _ev(grade):
    return {"grade": grade, "id": "x%d" % grade, "name": "e", "traits": []}


def test_rarity_needs_two_top_events_for_heaven():
    assert npc.rarity_of([_ev(1)]) != "天", "一条甲级不够天品"
    assert npc.rarity_of([_ev(1), _ev(1)]) == "天"
    assert npc.rarity_of([_ev(1), _ev(4)]) == "玄"
    assert npc.rarity_of([_ev(2), _ev(2)]) == "玄"
    assert npc.rarity_of([_ev(3), _ev(3), _ev(3)]) == "灵"
    assert npc.rarity_of([_ev(4)]) == "凡"


# ---------------------------------------------------------------- 随机任务

def test_mission_is_deterministic():
    a = mission.generate("nanyu", "abc12345")
    b = mission.generate("nanyu", "abc12345")
    assert a["id"] == b["id"]
    assert a["event_names"] == b["event_names"]
    assert a["scenario"]["scenes"] == b["scenario"]["scenes"]


def test_mission_id_roundtrip():
    m = mission.generate("linjing")
    parsed = mission.parse_id(m["id"])
    assert parsed is not None
    city_id, key = parsed
    again = mission.generate(city_id, key)
    assert again["id"] == m["id"]
    assert again["event_names"] == m["event_names"]


def test_mission_scene_shape():
    m = mission.generate("nanyu")
    scene = m["scenario"]["scenes"]
    kinds = [s["kind"] for s in scene]
    assert kinds[0] == "investigate"
    assert "combat" in kinds
    assert kinds[-1] == "choice"
    assert m["scenario"]["endings"].keys() == {"good", "neutral", "bad"}


def test_mission_difficulty_and_reward():
    m = mission.generate("nanyu")
    assert m["difficulty"] >= 1
    assert m["reward"] == max(5, m["difficulty"] * 3)
    assert m["grade"] in ("甲", "乙", "丙", "丁")


def test_mission_events_are_compatible_with_city():
    from app.content import events, world

    for city_id in ("nanyu", "banqiao", "linjing"):
        m = mission.generate(city_id)
        city = world.CITY_BY_ID[city_id]
        for event in (events.get(e) for e in m["events"]):
            assert events.compatible(event, city, None)
        assert len(m["events"]) in (2, 3)


def test_mission_uses_city_monster_pool():
    m = mission.generate("linjing")
    assert m["monster"]["hp"] > 0
    assert m["monster"]["name"]


def test_preview_returns_samples():
    samples = mission.preview("nanyu", 3)
    assert len(samples) == 3
    for s in samples:
        assert s["id"].startswith("gen-nanyu-")
        assert s["scenes"] >= 3


@pytest.mark.parametrize("bad", ["", "gen-", "gen-nowhere-abc", "mirror"])
def test_parse_id_rejects_junk(bad):
    assert mission.parse_id(bad) is None
