"""规则引擎的单测（不碰数据库，纯函数）。

    uv run pytest -q
"""

from __future__ import annotations

import pytest

from app.content import bestiary, scenario, shop, spirits, talismans
from app.engine import checks, gacha, kp, progress, session, sheet, wuxing
from app.engine.dice import Roller

ALL_SCENARIOS = [s["id"] for s in scenario.SCENARIOS]


# ---------------------------------------------------------------- 骰子

def test_dice_notation():
    r = Roller(seed="t")
    roll = r.roll("2d6+3")
    assert 5 <= roll.total <= 15
    assert len(roll.rolls) == 2


def test_dice_reproducible():
    a = Roller(seed="same")
    b = Roller(seed="same")
    assert [a.d(20) for _ in range(10)] == [b.d(20) for _ in range(10)]


def test_dice_rejects_junk():
    with pytest.raises(ValueError):
        Roller(seed="t").roll("asdf")


# ---------------------------------------------------------------- 五行

def test_ke_cycle():
    assert wuxing.multiplier("水", "火") == 1.5      # 水克火
    assert wuxing.multiplier("火", "水") == 0.5      # 被克
    assert wuxing.multiplier("金", "土") == 1.0      # 无涉
    assert wuxing.multiplier("煞", "水") == 1.25


def test_sha_is_its_own_thing():
    assert wuxing.relation("煞", "金") == "煞"
    assert wuxing.check_modifier("煞", "金") == 10


def test_sheng():
    assert wuxing.produces("水", "木")
    assert not wuxing.produces("木", "水")


# ---------------------------------------------------------------- 检定

def test_check_thresholds():
    r = Roller(seed="c")
    result = checks.resolve(r, "侦查", 50)
    assert 1 <= result.roll <= 100
    if result.roll <= 10:
        assert result.level == "大成功"
    assert result.level in checks.LEVELS


def test_check_fumble_at_96_when_target_low():
    hits = 0
    for i in range(300):
        res = checks.resolve(Roller(seed="f%d" % i), "体术", 20)
        if res.roll >= 96:
            assert res.level == "大失败"
            hits += 1
    assert hits > 0


# ---------------------------------------------------------------- 角色卡

def test_gacha_shape():
    card = gacha.roll(seed="fixed")
    assert card["school"] in sheet.SCHOOLS
    assert card["element"] in wuxing.ELEMENTS
    assert card["rank"] in sheet.RANKS
    for key in sheet.ATTRS:
        assert 3 <= card["attrs"][key] <= 20
    assert 1 <= len(card["traits"]) <= 3


def test_gacha_respects_school_floor():
    for i in range(30):
        card = gacha.roll(seed="floor-%d" % i)
        floor = gacha.SCHOOL_FLOOR[card["school"]]
        for key, minimum in floor.items():
            assert card["attrs"][key] >= minimum


def test_gacha_deterministic():
    assert gacha.roll(seed="dup")["code"] == gacha.roll(seed="dup")["code"]


def test_derived_resources_positive():
    card = gacha.roll(seed="derive")
    stats = sheet.derived(card)
    assert stats["hp_max"] > 0
    assert stats["mp_max"] > 0
    assert stats["san_max"] >= 10
    assert stats["skills"]["arcana"] >= 1


def test_rank_gates_spirits():
    low = {"school": "fulu", "element": "火", "rank": "初真", "attrs": {}, "traits": []}
    assert spirits.available("初真") == []
    assert len(spirits.available("五雷")) > 0
    assert sheet.derived(low)["can_summon"] is False


def test_approval_cheapens_summon():
    spirit = spirits.get("guanyu")
    assert spirits.approval_cost(spirit, 0) > spirits.approval_cost(spirit, 100)
    assert spirits.inherit_ratio(100) == 1.0


# ---------------------------------------------------------------- 祟物

def test_phase_changes_with_hp():
    monster = bestiary.get("huapi")
    assert bestiary.phase_for(monster, monster["hp"])["state"] == "灵体"
    assert bestiary.phase_for(monster, int(monster["hp"] * 0.4))["state"] == "附身"
    assert bestiary.phase_for(monster, int(monster["hp"] * 0.1))["state"] == "实体"


def test_state_gate():
    assert bestiary.state_gate("灵体", "physical") == 0.0
    assert bestiary.state_gate("灵体", "talisman") == 1.0
    assert bestiary.state_gate("实体", "physical") == 1.0


# ---------------------------------------------------------------- 一局

def _play(scenario_id: str, seed: str) -> dict:
    card = gacha.roll(seed=seed)
    sc = scenario.get(scenario_id)
    state = session.new_state(card, sc, seed=seed)
    for _ in range(200):
        if state["status"] != "active":
            break
        options = [a for a in session.view(card, sc, state)["actions"] if a["enabled"]]
        assert options, "没有可用操作 —— 死锁"
        options.sort(key=lambda a: {"attack": 0, "talisman": 1, "check": 2,
                                    "choice": 2, "env": 3, "ward": 4, "draw": 8}.get(a["kind"], 5))
        state, _events = session.act(card, sc, state, options[0]["id"])
    return {"card": card, "state": state, "scenario": sc}


@pytest.mark.parametrize("scenario_id", ALL_SCENARIOS)
def test_scenario_finishes(scenario_id):
    out = _play(scenario_id, "unit-%s" % scenario_id)
    assert out["state"]["status"] == "done"
    assert out["state"]["ending"]["grade"] in ("good", "neutral", "bad")
    assert out["state"]["ending"]["merit_award"] >= 0


def test_combat_always_terminates():
    """灵体态物理免疫，必须能被「逼现形」，否则就是死循环。"""
    card = gacha.roll(seed="stuck")
    card["school"] = "guti"
    card["attrs"]["str"] = 3          # 故意打不出伤害
    sc = scenario.get("mirror")
    state = session.new_state(card, sc, seed="stuck")
    state["scene_index"] = 3
    state["enemy"] = {
        "id": "huapi", "name": "画皮骨女", "element": "煞",
        "hp": 46, "max_hp": 46, "boost": 0,
    }
    reached = []
    for _ in range(60):
        state, _ = session.act(card, sc, state, "attack:melee")
        reached.append(state["enemy"]["hp"] if state["enemy"] else 0)
        if not state["enemy"]:
            break
    assert not state["enemy"], "祟物没被打散，逼现形没生效"
    assert max(reached) <= 46


def test_talisman_only_works_when_drawn():
    card = gacha.roll(seed="talis")
    sc = scenario.get("mirror")
    state = session.new_state(card, sc, seed="talis")
    state["scene_index"] = 3
    state["enemy"] = {"id": "huapi", "name": "画皮骨女", "element": "煞",
                      "hp": 46, "max_hp": 46, "boost": 0}
    usable = [a["id"] for a in session.view(card, sc, state)["actions"]]
    assert not any(a.startswith("talisman:") for a in usable)
    state["inventory"] = {"binghuo": 1}
    usable = [a["id"] for a in session.view(card, sc, state)["actions"]]
    assert "talisman:binghuo" in usable


def test_draw_consumes_pool():
    card = gacha.roll(seed="pool")
    sc = scenario.get("mirror")
    state = session.new_state(card, sc, seed="pool")
    before = state["draw_pool"]
    _state, events = session.act(card, sc, state, "draw:binghuo")
    assert state["draw_pool"] < before
    assert state["inventory"]["binghuo"] == 1
    assert events


def test_kp_event_table_never_breaks():
    for corruption in (0, 30, 60, 100):
        for i in range(50):
            ev = kp.event(Roller(seed="kp-%d-%d" % (corruption, i)), corruption, in_combat=True)
            if ev is not None:
                assert ev["id"] in kp.EVENT_BY_ID
                assert ev["text"]


# ---------------------------------------------------------------- 内容完整性

def test_content_ids_unique():
    assert len({t["id"] for t in talismans.TALISMANS}) == len(talismans.TALISMANS)
    assert len({b["id"] for b in bestiary.BESTIARY}) == len(bestiary.BESTIARY)
    assert len({s["id"] for s in spirits.SPIRITS}) == len(spirits.SPIRITS)


def test_scenario_references_exist():
    for sc in scenario.SCENARIOS:
        for scene in sc["scenes"]:
            if scene["kind"] == "combat":
                assert bestiary.get(scene["enemy"]), scene["enemy"]
            assert scene["kind"] in ("investigate", "combat", "choice")
        assert set(sc.get("endings", {})) == {"good", "neutral", "bad"}


def test_talisman_scales_defined():
    for tal in talismans.TALISMANS:
        if tal["kind"] in ("damage", "heal"):
            assert tal["damage"], tal["id"]
            assert tal["scale"] in sheet.ATTRS, tal["id"]


# ---------------------------------------------------------------- 授箓晋升

def _fresh_card(**extra) -> dict:
    card = gacha.roll(seed="progress-base")
    card.update({"completed_sessions": 0, "karma_good": 0, "karma_debt": 0,
                 "mind_trial_passed": False, "items": []})
    card.update(extra)
    return card


def test_next_rank_chain():
    assert progress.next_rank("初真") == "盟威"
    assert progress.next_rank("盟威") == "五雷"
    assert progress.next_rank("五雷") == "天师"
    assert progress.next_rank("天师") is None


def test_promotion_needs_three_sessions():
    card = _fresh_card(rank="初真")
    assert not progress.promotable(card)
    card["completed_sessions"] = 2
    assert not progress.promotable(card)
    card["completed_sessions"] = 3
    assert progress.promotable(card)


def test_five_thunder_needs_merit_and_trial():
    card = _fresh_card(rank="盟威", merit=49, mind_trial_passed=False)
    assert not progress.promotable(card)
    card["merit"] = 50
    assert not progress.promotable(card)   # 还差试炼
    card["mind_trial_passed"] = True
    assert progress.promotable(card)


def test_master_needs_karma():
    card = _fresh_card(rank="五雷", merit=80, completed_sessions=8, karma_good=2)
    assert not progress.promotable(card)
    card["karma_good"] = 3
    assert progress.promotable(card)


def test_promote_opens_new_spirits():
    card = _fresh_card(rank="初真", completed_sessions=3)
    result = progress.promote(card)
    assert result["to"] == "盟威"
    assert card["rank"] == "盟威"
    assert result["opened"]                       # 至少开了土地公之类
    assert card["approval"]                       # 新英灵有初始认可度
    assert all(0 <= v <= 100 for v in card["approval"].values())


def test_promote_refuses_when_unqualified():
    card = _fresh_card(rank="初真", completed_sessions=0)
    with pytest.raises(ValueError):
        progress.promote(card)


def test_trial_reproducible_and_counts():
    card = _fresh_card()
    a = progress.trial(card, seed="trial-x")
    b = progress.trial(card, seed="trial-x")
    assert a == b
    assert len(a["rolls"]) == progress.TRIAL_ROLLS
    assert a["passed"] == (a["passes"] >= progress.TRIAL_NEEDED)


# ---------------------------------------------------------------- 功德商店

def test_buy_deducts_merit():
    card = _fresh_card(merit=200)
    out = progress.buy(card, "taomu")
    assert out["spent"] == 100
    assert card["merit"] == 100
    assert card["items"][0]["id"] == "taomu"


def test_buy_refuses_when_broke():
    card = _fresh_card(merit=10)
    with pytest.raises(ValueError):
        progress.buy(card, "luban")
    assert card["merit"] == 10


def test_buy_respects_max_qty():
    card = _fresh_card(merit=500)
    progress.buy(card, "taomu")
    with pytest.raises(ValueError):
        progress.buy(card, "taomu")


def test_buy_respects_rank_gate():
    card = _fresh_card(rank="初真", merit=999)
    with pytest.raises(ValueError):
        progress.buy(card, "qingshenfu")


def test_uncanny_item_adds_karma_debt():
    card = _fresh_card(merit=0, rank="天师")
    progress.buy(card, "shihunding")
    assert card["karma_debt"] == 1
    base = sheet.skill_value({**card, "karma_debt": 0}, "melee")
    assert sheet.skill_value(card, "melee") == base - 10


def test_item_effects_apply_to_sheet():
    plain = _fresh_card()
    armed = {**plain, "items": [{"id": "dingshen_dan", "qty": 1},
                                {"id": "luban", "qty": 1}]}
    assert sheet.derived(armed)["san_max"] == sheet.derived(plain)["san_max"] + 5
    assert sheet.skill_value(armed, "arcana") == sheet.skill_value(plain, "arcana") + 10


def test_taomu_bonus_against_wood():
    """桃木剑对木属 +2，要真的进到效果表里。"""
    card = _fresh_card(items=[{"id": "taomu", "qty": 1}])
    effects = shop.effects_of(card)
    assert effects["damage_vs"]["木"] == 2
    assert effects["damage_vs"].get("火", 0) == 0


def test_shop_effects_are_pure():
    card = _fresh_card(merit=100)
    before = shop.effects_of(card)
    progress.buy(card, "dingshen_dan")
    after = shop.effects_of(card)
    assert after["san_max"] > before["san_max"]
    # 别的卡不受影响
    assert shop.effects_of(_fresh_card())["san_max"] == 0
