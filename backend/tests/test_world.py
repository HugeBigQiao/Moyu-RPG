"""世界层与人物生成的单测。"""

from __future__ import annotations

import pytest

from app.content import events, missions, traits, world
from app.engine import npc, sheet


# ---------------------------------------------------------------- 世界

def test_tiers_are_ordered_and_capped():
    assert [t["key"] for t in world.CITY_TIERS] == ["t0", "t1", "t2", "t3", "t4"]
    caps = [t["max_events"] for t in world.CITY_TIERS]
    assert caps == sorted(caps, reverse=True), "城市等级越高，事件上限必须越大"
    assert caps[0] == 10, "特级城市上限是 10 条事件"


def test_every_city_is_well_formed():
    for city in world.CITIES:
        assert city["tier"] in world.TIER_BY_KEY, city["id"]
        assert city["nation"] in world.NATION_BY_ID, city["id"]
        assert city["industries"], city["id"]
        for industry in city["industries"]:
            assert industry in world.INDUSTRY_BY_ID, (city["id"], industry)
        assert 10 <= city["pop"] <= 3000


def test_ids_unique():
    for group in (world.CITIES, world.NATIONS, world.SECTS, world.AGENCIES,
                  world.FIGURES, world.INDUSTRIES):
        ids = [item["id"] for item in group]
        assert len(ids) == len(set(ids))


def test_max_events_follows_tier():
    assert world.max_events("linjing") == 10
    assert world.max_events("banqiao") == 2
    assert world.max_events("no-such-city") == 2


# ---------------------------------------------------------------- 事件

def test_event_grades_and_scope():
    for event in events.EVENTS:
        assert event["grade"] in (1, 2, 3, 4), event["id"]
        if event["grade"] <= 2:
            assert event["scope"] == "mission", "甲/乙级事件必须限定任务"
            assert event.get("missions"), event["id"]
        else:
            assert event["scope"] == "general", "丙/丁级事件才允许通用"


def test_high_grade_events_are_rarer():
    by_grade = {}
    for event in events.EVENTS:
        by_grade.setdefault(event["grade"], []).append(event)
    assert len(by_grade[4]) > len(by_grade[1]), "甲级事件应该比丁级少"


def test_event_traits_exist():
    for event in events.EVENTS:
        for name in event.get("traits", []):
            assert name in traits.TRAITS, (event["id"], name)


def test_compatible_respects_city_and_mission():
    city = world.CITY_BY_ID["nanyu"]
    mirror = events.get("ev_mirror_death")
    assert events.compatible(mirror, city, "mirror")
    assert not events.compatible(mirror, city, "office")
    assert not events.compatible(mirror, city, None)


def test_pool_filters_by_grade():
    city = world.CITY_BY_ID["nanyu"]
    whole = events.pool(city, "mirror")
    only_low = events.pool(city, "mirror", max_grade=3)
    assert whole and only_low
    assert all(e["grade"] <= 3 for e, _ in only_low)
    assert len(only_low) <= len(whole)


# ---------------------------------------------------------------- 人物生成

def test_npc_event_count_within_city_cap():
    for city_id in ("linjing", "nanyu", "banqiao"):
        cap = world.max_events(city_id)
        for i in range(15):
            person = npc.roll_npc(city_id=city_id, seed="cap-%s-%d" % (city_id, i))
            assert 1 <= len(person["events"]) <= cap, (city_id, person["events"])
            assert person["city"] == city_id


def test_npc_is_deterministic():
    a = npc.roll_npc(city_id="nanyu", seed="dup")
    b = npc.roll_npc(city_id="nanyu", seed="dup")
    assert a["events"] == b["events"]
    assert a["attrs"] == b["attrs"]
    assert a["name"] == b["name"]


def test_npc_traits_come_from_events():
    person = npc.roll_npc(city_id="linjing", seed="traits")
    allowed = set()
    for eid in person["events"]:
        allowed.update(events.get(eid).get("traits", []))
    for trait in person["traits"]:
        assert trait["name"] in allowed


def test_npc_difficulty_and_reward_positive():
    person = npc.roll_npc(city_id="yunjin", seed="diff")
    assert person["difficulty"] >= 1
    assert person["reward"] >= 5
    assert person["kind"] == "npc"


def test_bigger_city_generates_richer_people():
    """特级城市能出更多事件的人；四级最多两条。"""
    top = [len(npc.roll_npc(city_id="linjing", seed="rich-%d" % i)["events"]) for i in range(20)]
    low = [len(npc.roll_npc(city_id="banqiao", seed="poor-%d" % i)["events"]) for i in range(20)]
    assert max(top) > max(low)


# ---------------------------------------------------------------- 玩家自建

def _payload(**over):
    base = {
        "name": "沈砚",
        "school": "fulu",
        "element": "火",
        "city": "nanyu",
        "attrs": {"str": 12, "agi": 12, "con": 12, "int": 12, "wil": 12, "per": 12},
        "events": [],
        "notes": "",
    }
    base.update(over)
    return base


def test_player_build_ok():
    card = npc.build_player(_payload())
    assert card["kind"] == "player"
    assert card["rank"] == "初真"
    assert sum(card["attrs"].values()) == 72
    assert card["city"] == "nanyu"


def test_player_points_must_be_exact():
    with pytest.raises(ValueError):
        npc.build_player(_payload(attrs={"str": 18, "agi": 12, "con": 12,
                                         "int": 12, "wil": 12, "per": 12}))


def test_player_attr_bounds():
    with pytest.raises(ValueError):
        npc.build_player(_payload(attrs={"str": 20, "agi": 10, "con": 11,
                                         "int": 11, "wil": 10, "per": 10}))


def test_player_rejects_incompatible_event():
    with pytest.raises(ValueError):
        # 甲级事件只挂在镜中鬼这个任务上，不能当出身事件
        npc.build_player(_payload(events=["ev_mirror_death"]))


def test_player_picks_compatible_event():
    card = npc.build_player(_payload(events=["ev_night_shift"]))
    assert "ev_night_shift" in card["events"]
    assert card["traits"], "事件应该带来特性"


def test_unknown_city_or_school_rejected():
    with pytest.raises(ValueError):
        npc.build_player(_payload(city="atlantis"))
    with pytest.raises(ValueError):
        npc.build_player(_payload(school="wuxia"))


# ---------------------------------------------------------------- 任务

def test_difficulty_reward_monotonic():
    easy = [events.get("ev_night_shift")]
    hard = [events.get("ev_mirror_death"), events.get("ev_survived_drought")]
    d1 = missions.difficulty_of(easy, 30, "t2")
    d2 = missions.difficulty_of(hard, 46, "t2")
    assert d2 > d1
    assert missions.reward_of(d2) > missions.reward_of(d1)


def test_fixed_missions_point_at_scenarios():
    for mission in missions.MISSIONS:
        assert mission["kind"] == "fixed"
        assert missions.scenario_of(mission), mission["id"]
        for city_id in mission["cities"]:
            assert city_id in world.CITY_BY_ID


def test_every_city_has_industry_context():
    for city in world.CITIES:
        assert missions.random_seed_pool(city["id"])


def test_sheet_traits_still_importable():
    assert "天眼" in sheet.TRAITS
    assert sheet.TRAITS["天眼"]["tier"] == 1
