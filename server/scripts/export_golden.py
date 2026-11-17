#!/usr/bin/env python3
"""导出 golden fixtures：给 Node/TS 移植做逐字段对拍。

职责：
    用现有 Python 引擎生成 PRNG、检定、五行、角色卡、整局回放的标准输出，
    写到 server/test/fixtures/*.json。迁移后的 TS 实现必须逐字节对上。
为什么需要：
    重写引擎最大的风险不是语法，而是「看起来一样、边界差 1」。
    先冻结行为，再改实现；对拍失败时能定位到具体字段与具体行动。
上下游：
    上游：backend/app（Python 参考实现）与 backend/data/content；
    下游：server/test/parity/*.test.ts。

用法：
    cd backend && uv run python ../server/scripts/export_golden.py
    或 PYTHONPATH=backend python3 server/scripts/export_golden.py
"""

from __future__ import annotations

import copy
import hashlib
import shutil
import tempfile
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]          # 仓库根
BACKEND = ROOT / "backend"
OUT = ROOT / "server" / "test" / "fixtures"
sys.path.insert(0, str(BACKEND))

from app.content import _store, edit, missions as missions_content, scenario, shop, spirits, traits  # noqa: E402
from app.engine import checks, gacha, kp, mission as mission_engine, npc, progress, sheet, wuxing  # noqa: E402
from app.engine import session as engine  # noqa: E402
from app.engine.dice import Roller  # noqa: E402

SEEDS = ["", "abc", "mirror", "gen-nanyu-1a2b3c4d", "trial-1-1", "nanyu|7919",
         "a" * 64, "1078112754c0ffee"]
INT_SEEDS = [0, 1, 4294967295, 2**63 + 1, 2**64 - 1, 2**32 * 12345 + 6789]


def dump(name: str, data) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("wrote", path.relative_to(ROOT), path.stat().st_size, "bytes")


def export_prng() -> dict:
    out = []
    for seed in SEEDS:
        r = Roller(seed=seed)
        rec = {
            "seed": seed,
            "d100": [r.d100() for _ in range(12)],
            "d6": [r.d(6) for _ in range(12)],
            "randint": [r.randint(1, 6) for _ in range(8)],
            "choice": [r.choice(["a", "b", "c", "d", "e"]) for _ in range(8)],
            "shuffle": r.shuffle(list(range(10))),
            "sample": r.sample(list(range(50)), 5),
            "sample_small": r.sample(list(range(8)), 6),
            "chance": [r.chance(p) for p in (0.0, 0.25, 0.5, 0.75, 1.0)],
            "history": [h.as_dict() for h in r.history],
        }
        # weighted 单独一组，便于核对「先 uniform 再累加」的次序
        r2 = Roller(seed=seed)
        pairs = [("w", 3), ("x", 7), ("y", 2), ("z", 9)]
        rec["weighted"] = [r2.weighted(pairs) for _ in range(8)]
        out.append(rec)

    ints = {}
    for seed in INT_SEEDS:
        bits = {}
        for k in (1, 7, 31, 32, 33, 63, 64, 100):
            r = random.Random(seed)
            bits[str(k)] = [str(r.getrandbits(k)) for _ in range(3)]
        ints[str(seed)] = bits

    # Python 的银行家舍入：TS 侧要用 pyRound 复刻
    rounding = []
    edge_values = [0.5, 1.5, 2.5, 3.5, -0.5, -1.5, 2.675, 1.005, 12.345, 0.05, -0.05]
    rnd = random.Random(20261117)
    random_values = [rnd.uniform(-1000, 1000) for _ in range(300)]
    for value in edge_values + random_values:
        rounding.append({
            "input": value,
            "round": round(value),
            "round2": round(value, 2),
            "round4": round(value, 4),
        })
    return {"string_seeds": out, "int_seeds": ints, "rounding": rounding}


def export_checks() -> list[dict]:
    cases = []
    skills = ["侦查", "符咒学", "体术", "身法", "精神抵抗"]
    for i, seed in enumerate(SEEDS):
        for j, skill in enumerate(skills):
            value = [5, 23, 47, 60, 88, 99][j]
            modifier = [-20, 0, 15][i % 3]
            key = "%s|check-%d-%d" % (seed, i, j)
            r = Roller(seed=key)
            result = checks.resolve(r, skill, value, modifier, reason="勘查")
            cases.append({
                "seed": key,
                "skill": skill,
                "value": value,
                "modifier": modifier,
                "result": result.as_dict(),
                "text": checks.describe(result),
                "history": [h.as_dict() for h in r.history],
            })
    return cases


def export_wuxing() -> list[dict]:
    rows = []
    for a in ("金", "木", "水", "火", "土", "煞", None):
        for d in ("金", "木", "水", "火", "土", "煞", None):
            rows.append({
                "attacker": a,
                "defender": d,
                "relation": wuxing.relation(a, d),
                "multiplier": wuxing.multiplier(a, d),
                "check_modifier": wuxing.check_modifier(a, d),
                "describe": wuxing.describe(a, d),
            })
    return rows


def export_sheet() -> list[dict]:
    trait_names = list(traits.TRAITS)
    shop_ids = [item["id"] for item in shop.ITEMS]
    cards = []
    idx = 0
    for school in sheet.SCHOOLS:
        for rank in sheet.RANKS:
            idx += 1
            attrs = {
                "str": 6 + (idx * 3) % 13,
                "agi": 8 + (idx * 5) % 11,
                "con": 7 + (idx * 7) % 12,
                "int": 9 + (idx * 2) % 10,
                "wil": 8 + (idx * 4) % 11,
                "per": 10 + (idx * 3) % 9,
            }
            picked_traits = [trait_names[(idx + k) % len(trait_names)] for k in range(3)]
            items = [
                {"id": shop_ids[(idx + k) % len(shop_ids)], "qty": 1 + k % 2}
                for k in range(2)
            ]
            card = {
                "school": school,
                "element": ("金", "木", "水", "火", "土")[idx % 5],
                "rank": rank,
                "merit": 10 * idx,
                "attrs": attrs,
                "traits": [{"name": name, "tier": traits.TRAITS[name]["tier"]} for name in picked_traits],
                "items": items,
                "karma_debt": idx % 3,
                "skill_bonus": {"melee": idx % 4, "investigate": idx % 6},
            }
            cards.append({
                "card": card,
                "derived": sheet.derived(card),
                "skills": {sid: sheet.skill_value(card, sid) for sid in sheet.SKILLS},
                "display_attrs": sheet.display_attrs(card),
                "trait_sum": {
                    key: sheet.trait_sum(card, key)
                    for key in ("hp", "mp", "san", "agility", "summon", "merit")
                },
            })
    return cards


def _scene_kind(scenario_doc: dict, state: dict) -> str:
    index = min(state["scene_index"], len(scenario_doc["scenes"]) - 1)
    return scenario_doc["scenes"][index]["kind"]


def _pick_action(card: dict, scenario_doc: dict, state: dict) -> str | None:
    actions = engine.actions(card, scenario_doc, state)
    enabled = [a for a in actions if a.get("enabled")]
    if not enabled:
        return None
    # 固定策略：勘查选项 → 攻击 → 符/结界/环境 → 抉择；保证一局能走完
    for prefix in ("opt:", "attack:", "talisman:", "choice:", "draw:", "ward", "env", "flee", "summon:"):
        for action in enabled:
            if action["id"].startswith(prefix):
                return action["id"]
    return enabled[0]["id"]


def _pick_action_toolbox(card: dict, scenario_doc: dict, state: dict, step: int) -> str | None:
    """覆盖更多分支：先画符，战斗里依次用符/结界/请神/法术/环境。"""
    actions = engine.actions(card, scenario_doc, state)
    enabled = [a for a in actions if a.get("enabled")]
    if not enabled:
        return None
    kind = _scene_kind(scenario_doc, state)

    def first(prefix: str) -> str | None:
        return next((a["id"] for a in enabled if a["id"].startswith(prefix)), None)

    if kind == "investigate":
        if step < 3:
            draw = first("draw:")
            if draw:
                return draw
        return first("opt:") or enabled[0]["id"]
    if kind == "combat":
        for prefix in ("talisman:", "ward", "summon:", "attack:spell", "env", "attack:melee", "flee"):
            action = first(prefix)
            if action:
                return action
    if kind == "choice":
        choices = [a["id"] for a in enabled if a["id"].startswith("choice:")]
        if choices:
            return choices[step % len(choices)]
    return enabled[0]["id"]


def _run_session(card: dict, scenario_doc: dict, seed: str, policy="default", max_steps: int = 40) -> dict:
    state = engine.new_state(card, scenario_doc, seed=seed)
    steps = []
    for step in range(max_steps):
        if state["status"] != engine.ACTIVE:
            break
        if policy == "toolbox":
            action_id = _pick_action_toolbox(card, scenario_doc, state, step)
        else:
            action_id = _pick_action(card, scenario_doc, state)
        if not action_id:
            break
        state, events = engine.act(card, scenario_doc, state, action_id)
        steps.append({
            "action": action_id,
            "events": events,
            "state": copy.deepcopy(state),
        })
    return {
        "seed": seed,
        "scenario_id": scenario_doc["id"],
        "scenario": scenario_doc,
        "card": card,
        "steps": steps,
        "final_state": copy.deepcopy(state),
        "view": engine.view(card, scenario_doc, state),
    }


def export_sessions() -> list[dict]:
    base_card = {
        "school": "fulu",
        "element": "木",
        "rank": "初真",
        "merit": 20,
        "attrs": {"str": 10, "agi": 12, "con": 11, "int": 15, "wil": 13, "per": 14},
        "traits": [{"name": "胆大", "tier": 3}, {"name": "耳聪", "tier": 4}],
        "items": [],
        "karma_debt": 0,
        "skill_bonus": {},
    }
    toolbox_card = {
        "school": "fulu",
        "element": "水",
        "rank": "盟威",
        "merit": 100,
        "attrs": {"str": 12, "agi": 13, "con": 12, "int": 17, "wil": 15, "per": 14},
        "traits": [{"name": "胆大", "tier": 3}, {"name": "天眼", "tier": 2}],
        "items": [{"id": "taomu", "qty": 1}, {"id": "luban", "qty": 1}],
        "approval": {spirit["id"]: 80 for spirit in spirits.available("盟威")},
        "karma_debt": 0,
        "skill_bonus": {"arcana": 10, "investigate": 5},
    }

    cases = []
    for scenario_doc in scenario.SCENARIOS:
        for run in range(3):
            seed = "golden-%s-%d" % (scenario_doc["id"], run)
            cases.append(_run_session(base_card, scenario_doc, seed))
        for run in range(2):
            seed = "golden-%s-tool-%d" % (scenario_doc["id"], run)
            cases.append(_run_session(toolbox_card, scenario_doc, seed, policy="toolbox"))

    # 随机任务：城市 × key 固定，验证 mission.generate 与场景流的拼接
    for city_id in ("nanyu", "linjing", "lijiang", "yunjin", "baishi"):
        mission = mission_engine.generate(city_id, "golden-" + city_id)
        cases.append(_run_session(base_card, mission["scenario"], "golden-rand-" + city_id))
        cases.append(_run_session(toolbox_card, mission["scenario"],
                                  "golden-rand-tool-" + city_id, policy="toolbox"))
    return cases


def _base_card(**overrides) -> dict:
    card = {
        "school": "fulu",
        "element": "木",
        "rank": "初真",
        "merit": 20,
        "attrs": {"str": 10, "agi": 12, "con": 11, "int": 15, "wil": 13, "per": 14},
        "traits": [{"name": "胆大", "tier": 3}, {"name": "耳聪", "tier": 4}],
        "items": [],
        "karma_debt": 0,
        "skill_bonus": {},
    }
    card.update(overrides)
    return card


def export_gacha() -> dict:
    seeds = ["", "gacha-1", "gacha-2", "gacha-3", "seed-abc", "天品", "x" * 32, "42"]
    return {
        "cards": [gacha.roll(seed=seed) for seed in seeds],
        "rates": gacha.rate_table(),
    }


def export_npc() -> dict:
    cities = ["nanyu", "linjing", "lijiang", "yunjin", "baishi"]
    mission_id = missions_content.MISSIONS[0]["id"]
    npcs = []
    for index, city in enumerate(cities):
        npcs.append(npc.roll_npc(city_id=city, seed="npc-%s" % city))
        npcs.append(npc.roll_npc(city_id=city, mission_id=mission_id, seed="npc-m-%s" % city))
    npcs.append(npc.roll_npc(seed="npc-any"))

    attrs = [npc.roll_player_attrs(seed="attrs-%d" % i) for i in range(8)]
    players = []
    payloads = [
        {"name": "测试甲", "school": "fulu", "element": "金", "city": "nanyu"},
        {"name": "测试乙", "school": "neidan", "element": "水", "city": "linjing", "notes": "自建"},
        {"name": "测试丙", "school": "guti", "element": "土", "city": "lijiang",
         "attrs": {"str": 14, "agi": 10, "con": 15, "int": 9, "wil": 11, "per": 13}},
    ]
    for index, payload in enumerate(payloads):
        players.append(npc.build_player(payload, seed="player-%d" % index))

    return {"npcs": npcs, "attrs": attrs, "players": players}


def export_missions() -> dict:
    cities = ["nanyu", "linjing", "lijiang", "yunjin", "baishi"]
    out = []
    for city in cities:
        out.append(mission_engine.generate(city, "golden-" + city))
        out.append(mission_engine.generate(city, "abc"))
    return out


def _progress_card(**overrides) -> dict:
    card = _base_card()
    card.update(overrides)
    return card


def export_progress() -> dict:
    cards = [
        _progress_card(rank="初真", completed_sessions=3),
        _progress_card(rank="盟威", merit=60, mind_trial_passed=True),
        _progress_card(rank="五雷", merit=85, karma_good=3, completed_sessions=8),
        _progress_card(rank="天师", merit=100),
    ]
    reqs = []
    for card in cards:
        reqs.append({
            "card": card,
            "requirements": progress.requirements(card),
            "promotable": progress.promotable(card),
        })

    promotions = []
    for card in cards:
        copy = json.loads(json.dumps(card))
        try:
            result = progress.promote(copy)
            promotions.append({"result": result, "card": copy})
        except ValueError as exc:
            promotions.append({"error": str(exc)})

    trials = [progress.trial(_base_card(), seed="trial-%d" % i) for i in range(6)]

    buys = []
    buy_card = _base_card(rank="天师", merit=500)
    for item_id in ["taomu", "taomu", "qingshenfu", "huangfu", "nope"]:
        copy = json.loads(json.dumps(buy_card))
        try:
            result = progress.buy(copy, item_id)
            buys.append({"item_id": item_id, "result": result, "card": copy})
            buy_card = copy
        except ValueError as exc:
            buys.append({"item_id": item_id, "error": str(exc)})

    return {"requirements": reqs, "promotions": promotions, "trials": trials, "buys": buys}


def export_kp() -> dict:
    out = []
    for corruption in (0, 25, 45, 70, 95):
        for seed in ("kp-a", "kp-b"):
            roller = Roller(seed=seed)
            events = [kp.event(roller, corruption, in_combat=bool(i % 2)) for i in range(6)]
            out.append({"corruption": corruption, "seed": seed, "events": events})

    transitions = []
    for i in range(4):
        transitions.append(kp.transition(Roller(seed="trans-%d" % i)))
    hints = [kp.stuck_hint(Roller(seed="hint-%d" % i), ["a"] * i) for i in range(4)]
    return {"events": out, "transitions": transitions, "hints": hints}


def export_edit() -> dict:
    """在临时目录里跑一遍 11 类档案的增删改，记录返回值与报错文本。"""
    tmp = Path(tempfile.mkdtemp(prefix="moyu-edit-"))
    try:
        shutil.copytree(_store.CONTENT_DIR, tmp, dirs_exist_ok=True)
        _store.CONTENT_DIR = tmp
        _store.reload_all()

        ops = []
        for kind in edit.KINDS:
            items = edit.items(kind)
            if not items:
                continue
            first = copy.deepcopy(items[0])
            payload = dict(first)
            if kind == "traits":
                payload["name"] = payload["name"] + "甲"
            else:
                payload["id"] = payload["id"] + "_x"

            created = edit.create(kind, payload)
            updated_payload = dict(created)
            if kind == "traits":
                updated_payload["name"] = created["name"]
                updated_payload["desc"] = (created.get("desc") or "") + "改"
            elif "name" in created:
                updated_payload["name"] = created["name"] + "改"
            elif "title" in created:
                updated_payload["title"] = created["title"] + "改"
            updated = edit.update(kind, edit._id_of(kind, created), updated_payload)
            removed = edit.remove(kind, edit._id_of(kind, created))
            try:
                edit.create(kind, {})
                invalid = None
            except edit.EditError as exc:
                invalid = str(exc)

            ops.append({
                "kind": kind,
                "created": created,
                "updated": updated,
                "removed": removed,
                "count": edit.count(kind),
                "invalid": invalid,
            })

        # 删除被引用的条目：应该给出人类可读的拒绝理由
        refusals = []
        for kind, item_id in (("cities", "nanyu"), ("nations", "zhonghua")):
            try:
                edit.remove(kind, item_id)
                refusals.append({"kind": kind, "id": item_id, "error": None})
            except edit.EditError as exc:
                refusals.append({"kind": kind, "id": item_id, "error": str(exc)})

        return {"ops": ops, "refusals": refusals}
    finally:
        _store.CONTENT_DIR = ROOT / "backend" / "data" / "content"
        _store.reload_all()
        shutil.rmtree(tmp, ignore_errors=True)


def main() -> None:
    print("python", sys.version.split()[0])
    dump("prng.json", export_prng())
    dump("checks.json", export_checks())
    dump("wuxing.json", export_wuxing())
    dump("sheet.json", export_sheet())
    sessions = export_sessions()
    dump("gacha.json", export_gacha())
    dump("npc.json", export_npc())
    dump("missions.json", export_missions())
    dump("progress.json", export_progress())
    dump("kp.json", export_kp())
    dump("edit.json", export_edit())
    dump("sessions.json", sessions)
    print("sessions:", len(sessions), "steps:",
          sum(len(case["steps"]) for case in sessions))


if __name__ == "__main__":
    main()
