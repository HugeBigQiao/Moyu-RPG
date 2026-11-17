"""档案编辑：增删改、校验与引用拦截。

测试都在临时目录里跑：先把 data/content 复制一份，再把 _store.CONTENT_DIR 指过去，
所以不会弄脏仓库里的设定文件。
"""

from __future__ import annotations

import json
import shutil

import pytest

from app.content import _store, edit, world
from app.content import scenario as scenario_mod


@pytest.fixture
def content(tmp_path, monkeypatch):
    """把内容目录拷到 tmp，测试期间所有读写都对着副本。"""
    src = _store.CONTENT_DIR
    dst = tmp_path / "content"
    shutil.copytree(src, dst)
    monkeypatch.setattr(_store, "CONTENT_DIR", dst)
    _store.reload_all()
    try:
        yield dst
    finally:
        monkeypatch.setattr(_store, "CONTENT_DIR", src)
        _store.reload_all()


def read(path, name):
    return json.loads((path / (name + ".json")).read_text(encoding="utf-8"))


# ---------------------------------------------------------------- 全类别冒烟

MINIMAL = {
    "nations": {"id": "test_nation", "name": "测试国"},
    "sects": {"id": "test_sect", "name": "测试派", "relations": {"zhengyi": "客气"}},
    "agencies": {"id": "test_agency", "name": "测试司"},
    "figures": {"id": "test_figure", "name": "测试人", "element": "金"},
    "industries": {"id": "test_industry", "name": "测试行"},
    "cities": {"id": "test_city", "name": "测试城", "tier": "t4", "nation": "xia",
               "industries": ["realestate"], "lat": 30.5, "lon": 110.2},
    "lore": {"id": "test_lore", "title": "测试条", "body": "正文"},
    "events": {"id": "ev_test", "name": "测试事件", "grade": 3, "scope": "general",
               "traits": ["天眼"], "industries": ["realestate"]},
    "missions": {"id": "test_mission", "name": "测试任务", "tier": 2, "kind": "fixed",
                 "cities": ["nanyu"]},
    "equipment": {"id": "test_gear", "name": "测试装备", "grade": 3, "price": 10},
    "traits": {"name": "测试特性", "tier": 3, "desc": "说明", "effect": {"san": 1}},
}


@pytest.mark.parametrize("kind", sorted(MINIMAL))
def test_create_then_delete_every_kind(content, kind):
    payload = MINIMAL[kind]
    item_id = payload.get("name") if kind == "traits" else payload["id"]

    item = edit.create(kind, payload)
    assert item, "创建应该返回条目"
    assert edit.find(kind, item_id) is not None, "%s 创建后应能查到" % kind

    edit.remove(kind, item_id)
    assert edit.find(kind, item_id) is None, "%s 删除后不该还在" % kind


def test_written_file_is_valid_and_keeps_format(content):
    edit.create("nations", {"id": "test_nation", "name": "测试国"})
    raw = (content / "world.json").read_text(encoding="utf-8")
    data = json.loads(raw)
    assert raw == json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    assert any(n["id"] == "test_nation" for n in data["nations"])


# ---------------------------------------------------------------- 城市

def test_city_writes_geo_and_factions(content):
    edit.create("cities", {
        "id": "test_city", "name": "测试城", "tier": "t4", "nation": "xia",
        "pop": 30, "industries": ["realestate"], "landmarks": ["老桥"],
        "lat": 31.25, "lon": 118.5,
        "factions": [{"name": "测试观", "kind": "教派", "note": "本地话事人"}],
    })
    data = read(content, "world")
    assert data["city_geo"]["test_city"] == [31.25, 118.5]
    assert data["city_factions"]["test_city"][0]["name"] == "测试观"
    # 其他城市的坐标不能被动过
    assert data["city_geo"]["nanyu"] == [23.13, 113.26]
    assert world.CITY_BY_ID["test_city"]["name"] == "测试城"


def test_city_update_keeps_order_and_geo(content):
    edit.update("cities", "nanyu", {
        "id": "nanyu", "name": "南屿", "tier": "t1", "nation": "xia", "pop": 1100,
        "industries": ["realestate", "internet"], "landmarks": ["旧码头"],
        "blurb": "改过的简介", "lat": 23.13, "lon": 113.26,
    })
    data = read(content, "world")
    ids = [c["id"] for c in data["cities"]]
    assert ids.index("nanyu") == 1, "修改不应该改变城市顺序"
    assert data["cities"][1]["blurb"] == "改过的简介"
    assert data["city_geo"]["nanyu"] == [23.13, 113.26]


def test_delete_city_in_use_is_refused(content):
    with pytest.raises(edit.EditError) as info:
        edit.remove("cities", "nanyu")
    assert "任务" in str(info.value)


def test_duplicate_id_is_refused(content):
    with pytest.raises(edit.EditError):
        edit.create("nations", {"id": "xia", "name": "又一个夏"})


def test_bad_id_is_refused(content):
    with pytest.raises(edit.EditError):
        edit.create("nations", {"id": "大写 ID", "name": "不行"})


# ---------------------------------------------------------------- 事件 / 特性

def test_event_grade_rules(content):
    with pytest.raises(edit.EditError) as info:
        edit.create("events", {"id": "ev_bad", "name": "甲级通用", "grade": 1, "scope": "general"})
    assert "限定任务" in str(info.value)

    with pytest.raises(edit.EditError):
        edit.create("events", {"id": "ev_bad2", "name": "限定但没挂任务",
                               "grade": 2, "scope": "mission"})


def test_event_unknown_trait_is_refused(content):
    with pytest.raises(edit.EditError) as info:
        edit.create("events", {"id": "ev_bad", "name": "坏特性", "grade": 3,
                               "scope": "general", "traits": ["不存在的特性"]})
    assert "不存在" in str(info.value)


def test_delete_trait_in_use_is_refused(content):
    with pytest.raises(edit.EditError) as info:
        edit.remove("traits", "天眼")
    assert "事件" in str(info.value)


# ---------------------------------------------------------------- 任务与占位剧本

def test_new_mission_gets_playable_stub_scenario(content):
    edit.create("missions", {"id": "test_mission", "name": "测试任务", "tier": 2,
                             "kind": "fixed", "cities": ["nanyu"], "blurb": "现场说明"})
    mission = edit.find("missions", "test_mission")
    assert mission["scenario_id"] == "test_mission"
    scenario = scenario_mod.get("test_mission")
    assert scenario and scenario.get("auto") is True
    assert [s["kind"] for s in scenario["scenes"]] == ["investigate", "choice", "ending"]
    assert scenario["scenes"][0]["options"][0]["clue"]


def test_delete_mission_removes_its_stub(content):
    edit.create("missions", {"id": "test_mission", "name": "测试任务", "cities": ["nanyu"]})
    edit.remove("missions", "test_mission")
    assert scenario_mod.get("test_mission") is None
    assert edit.find("missions", "test_mission") is None


def test_stub_scenario_is_playable(content):
    """新任务自动生成的剧本必须能一路走到结案，不然「能加任务」就是假的。"""
    from app.engine import session as engine

    edit.create("missions", {"id": "test_mission", "name": "测试任务", "cities": ["nanyu"]})
    scenario = scenario_mod.get("test_mission")
    card = {
        "school": "fulu", "element": "金", "rank": "初真",
        "attrs": {"str": 10, "agi": 10, "con": 10, "int": 12, "wil": 10, "per": 12},
        "traits": [], "merit": 0, "items": [], "approval": {},
        "completed_sessions": 0, "karma_good": 0, "karma_debt": 0,
        "mind_trial_passed": False,
    }
    state = engine.new_state(card, scenario, seed="stub-test")

    guard = 0
    while state["status"] == engine.ACTIVE and guard < 40:
        guard += 1
        actions = engine.actions(card, scenario, state)
        assert actions, "每一场都该有可选操作"
        state, _events = engine.act(card, scenario, state, actions[0]["id"])

    assert guard < 40, "剧本走不完，可能卡在勘查场"
    assert state["status"] == engine.DONE
    assert state["ending"]["grade"] in ("good", "neutral", "bad")


def test_mission_with_unknown_scenario_is_refused(content):
    with pytest.raises(edit.EditError) as info:
        edit.create("missions", {"id": "test_mission", "name": "测试任务",
                                 "cities": ["nanyu"], "scenario_id": "nope"})
    assert "剧本" in str(info.value)


def test_mission_without_city_is_refused(content):
    with pytest.raises(edit.EditError):
        edit.create("missions", {"id": "test_mission", "name": "测试任务", "cities": []})


# ---------------------------------------------------------------- 教派关系

def test_sect_relation_must_point_to_known_id(content):
    with pytest.raises(edit.EditError) as info:
        edit.create("sects", {"id": "test_sect", "name": "测试派",
                              "relations": {"no_such": "敌对"}})
    assert "不存在" in str(info.value)


def test_sect_relation_cannot_point_to_self(content):
    with pytest.raises(edit.EditError):
        edit.create("sects", {"id": "test_sect", "name": "测试派",
                              "relations": {"test_sect": "自己"}})


# ---------------------------------------------------------------- 其它

def test_unknown_kind_is_refused(content):
    with pytest.raises(edit.EditError):
        edit.create("no_such_kind", {})


def test_update_missing_item_is_refused(content):
    with pytest.raises(edit.EditError):
        edit.update("nations", "nope", {"name": "无"})


def test_trait_update_keeps_name_and_effects(content):
    edit.update("traits", "天眼", {"name": "天眼", "tier": 1, "desc": "改过",
                                   "effect": {"wuxing": 12, "san": -3}})
    spec = read(content, "traits")["traits"]["天眼"]
    assert spec["desc"] == "改过"
    assert spec["effect"] == {"wuxing": 12, "san": -3}
