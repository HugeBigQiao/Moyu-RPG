"""一局的流程引擎。

职责：
    状态机：勘查、遭遇、抉择、结算；处理伤害、形态变化、KP 事件与结局。
为什么需要：
    这是全项目最复杂的一块，必须与接口层解耦才能单测与回放。
上下游：
    上游：checks、wuxing、kp、content/*；下游：api/sessions。
"""


from __future__ import annotations

from . import checks, kp, sheet, wuxing
from .dice import Roller, new_seed
from ..content import bestiary as bestiary_mod
from ..content import shop as shop_mod
from ..content import spirits as spirits_mod
from ..content import talismans as talisman_mod

ACTIVE = "active"
DONE = "done"


def event(kind: str, text: str, severity: str = "info", **payload) -> dict:
    return {"kind": kind, "text": text, "severity": severity, "payload": payload}


# ---------------------------------------------------------------- 开局

def new_state(card: dict, scenario: dict, seed: str | None = None) -> dict:
    stats = sheet.derived(card)
    seed = seed or new_seed()
    return {
        "seed": seed,
        "scene_index": 0,
        "turn": 1,
        "status": ACTIVE,
        "corruption": int(scenario.get("start_corruption", 0)),
        "clues": [],
        "hp": stats["hp_max"],
        "hp_max": stats["hp_max"],
        "mp": stats["mp_max"],
        "mp_max": stats["mp_max"],
        "san": stats["san_max"],
        "san_max": stats["san_max"],
        "jianyi": 0,
        "shaqi": 0,
        "draw_pool": stats["draw_pool"],
        "inventory": {},
        "enemy": None,
        "summon": None,
        "ward": 0,
        "karma": [],
        "ending": None,
    }


def _roller(state: dict) -> Roller:
    """每条行动都从同一个种子派生，保证「同一个种子 = 同一局」。"""
    return Roller(seed="%s|%d" % (state["seed"], state["turn"] * 7919 + len(state["clues"])))


def _scene(scenario: dict, state: dict) -> dict:
    index = min(state["scene_index"], len(scenario["scenes"]) - 1)
    return scenario["scenes"][index]


# ---------------------------------------------------------------- 视图

def _clamp(state: dict) -> None:
    state["hp"] = max(0, min(state["hp_max"], state["hp"]))
    state["mp"] = max(0, min(state["mp_max"], state["mp"]))
    state["san"] = max(0, min(state["san_max"], state["san"]))
    state["corruption"] = max(0, min(100, state["corruption"]))


def view(card: dict, scenario: dict, state: dict) -> dict:
    scene = _scene(scenario, state)
    stats = sheet.derived(card)
    return {
        "status": state["status"],
        "turn": state["turn"],
        "scene": {
            "id": scene["id"],
            "kind": scene["kind"],
            "name": scene["name"],
            "place": scene.get("place", ""),
            "text": scene.get("text", ""),
            "index": state["scene_index"],
            "total": len(scenario["scenes"]),
        },
        "bars": {
            "hp": {"value": state["hp"], "max": state["hp_max"], "label": "气血"},
            "mp": {"value": state["mp"], "max": state["mp_max"], "label": "灵力"},
            "san": {"value": state["san"], "max": state["san_max"], "label": "理智"},
            "corruption": {"value": state["corruption"], "max": 100, "label": "阴浊"},
        },
        "clues": state["clues"],
        "enemy": _enemy_view(state),
        "summon": state["summon"],
        "inventory": state["inventory"],
        "karma": state["karma"],
        "actions": actions(card, scenario, state),
        "ending": state["ending"],
        "stats": stats,
    }


def _enemy_view(state: dict) -> dict | None:
    enemy = state.get("enemy")
    if not enemy:
        return None
    monster = bestiary_mod.get(enemy["id"]) or {}
    phase = bestiary_mod.phase_for(monster, enemy["hp"]) if monster else {"state": "?", "label": "?"}
    return {
        "name": enemy["name"],
        "hp": enemy["hp"],
        "max_hp": enemy["max_hp"],
        "state": phase["state"],
        "phase_label": phase["label"],
        "element": enemy["element"],
        "weakness": monster.get("weakness", []),
        "lore": monster.get("lore", ""),
    }


# ---------------------------------------------------------------- 可选项

def actions(card: dict, scenario: dict, state: dict) -> list[dict]:
    if state["status"] != ACTIVE:
        return []
    scene = _scene(scenario, state)
    kind = scene["kind"]

    if kind == "investigate":
        return _investigate_actions(scene)
    if kind == "combat":
        return _combat_actions(card, state)
    if kind == "choice":
        return _choice_actions(scene)
    return []


def _investigate_actions(scene: dict) -> list[dict]:
    out = []
    for opt in scene.get("options", []):
        skill_name = sheet.SKILLS.get(opt["skill"], (opt["skill"], ""))[0]
        out.append({
            "id": "opt:" + opt["id"],
            "label": opt["label"],
            "skill": opt["skill"],
            "skill_name": skill_name,
            "kind": "check",
            "hint": "过 %s" % skill_name,
            "cost": {},
            "enabled": True,
        })
    out.extend(_draw_actions())
    return out


def _draw_actions() -> list[dict]:
    out = []
    for tal in talisman_mod.TALISMANS:
        out.append({
            "id": "draw:" + tal["id"],
            "label": "画一张「%s」" % tal["name"],
            "kind": "draw",
            "hint": "耗符力 %d" % tal["draw_cost"],
            "cost": {"draw": tal["draw_cost"]},
            "enabled": True,
        })
    return out


def _combat_actions(card: dict, state: dict) -> list[dict]:
    school = card.get("school")
    out = [
        {"id": "attack:melee", "label": "贴身强攻", "kind": "attack",
         "hint": "体术 · 物理", "cost": {}, "enabled": True},
        {"id": "attack:spell", "label": "法术直取", "kind": "attack",
         "hint": "法术 · 耗灵力 3", "cost": {"mp": 3},
         "enabled": state["mp"] >= 3},
    ]
    if school in ("jianxiu", "neidan"):
        out.append({"id": "attack:blade", "label": "御剑", "kind": "attack",
                    "hint": "御剑 · 耗剑意 2", "cost": {"jianyi": 2},
                    "enabled": state["jianyi"] >= 2})
    if school == "anqi":
        out.append({"id": "attack:hidden", "label": "暗器出手", "kind": "attack",
                    "hint": "暗器 · 耗杀气 2", "cost": {"shaqi": 2},
                    "enabled": state["shaqi"] >= 2})

    for tal_id, count in state.get("inventory", {}).items():
        tal = talisman_mod.get(tal_id)
        if not tal or count <= 0:
            continue
        cost = tal["use_cost"]
        out.append({
            "id": "talisman:" + tal_id,
            "label": "引动「%s」×%d" % (tal["name"], count),
            "kind": "talisman",
            "hint": "%s · 耗灵力 %d" % (tal["element"], cost),
            "cost": {"mp": cost},
            "enabled": state["mp"] >= cost,
        })

    out.append({"id": "ward", "label": "结成结界", "kind": "ward",
                "hint": "三回合减伤 · 耗灵力 2", "cost": {"mp": 2},
                "enabled": state["mp"] >= 2 and state["ward"] <= 0})

    for spirit in spirits_mod.available(card.get("rank", "初真")):
        approval = int(card.get("approval", {}).get(spirit["id"], 0))
        cost = max(1, spirits_mod.approval_cost(spirit, approval)
                   - int(shop_mod.effects_of(card)["summon_discount"]))
        out.append({
            "id": "summon:" + spirit["id"],
            "label": "请神：%s" % spirit["name"],
            "kind": "summon",
            "hint": "%s · 耗灵力 %d · 认可 %d" % (spirit["rank"], cost, approval),
            "cost": {"mp": cost},
            "enabled": state["mp"] >= cost and state["summon"] is None,
        })

    out.append({"id": "env", "label": "借用环境", "kind": "env",
                "hint": "侦查 · 找这层楼能用的东西", "cost": {}, "enabled": True})
    out.append({"id": "flee", "label": "先退出去", "kind": "flee",
                "hint": "身法 · 失败会被追击", "cost": {}, "enabled": True})
    return out


def _choice_actions(scene: dict) -> list[dict]:
    return [{
        "id": "choice:" + choice["id"],
        "label": choice["label"],
        "kind": "choice",
        "hint": "因果：%s" % choice.get("karma", "未定"),
        "cost": {},
        "enabled": True,
    } for choice in scene.get("choices", [])]


# ---------------------------------------------------------------- 行动

def act(card: dict, scenario: dict, state: dict, action_id: str, payload: dict | None = None):
    """执行一个行动，返回 (新状态, 事件列表)。状态是原地改的副本由调用方决定。"""
    payload = payload or {}
    if state["status"] != ACTIVE:
        return state, [event("warn", "这一局已经结束了。", "warn")]

    roller = _roller(state)
    scene = _scene(scenario, state)
    events: list[dict] = []

    head, _, arg = action_id.partition(":")
    if head == "opt":
        events.extend(_do_investigate(card, scenario, state, scene, arg, roller))
    elif head == "draw":
        events.extend(_do_draw(card, state, arg))
    elif head in ("attack", "talisman", "ward", "env", "flee", "summon"):
        events.extend(_do_combat(card, scenario, state, scene, action_id, roller))
    elif head == "choice":
        events.extend(_do_choice(card, scenario, state, scene, arg, roller))
    else:
        return state, [event("warn", "看不懂这个操作：%s" % action_id, "warn")]

    state["turn"] += 1
    _clamp(state)
    if state["hp"] <= 0 and state["status"] == ACTIVE:
        events.extend(_finalize(card, scenario, state, roller))
        _clamp(state)
    return state, events


def _do_investigate(card, scenario, state, scene, option_id, roller) -> list[dict]:
    option = next((o for o in scene.get("options", []) if o["id"] == option_id), None)
    if not option:
        return [event("warn", "这里没有这个选项。", "warn")]

    events = []
    target = sheet.skill_value(card, option["skill"])
    modifier = 0
    if state["corruption"] >= 60:
        modifier -= 10
    result = checks.resolve(
        roller,
        sheet.SKILLS[option["skill"]][0],
        target,
        modifier,
        reason="勘查",
    )
    events.append(event(
        "check",
        checks.describe(result),
        "good" if result.success else "warn",
        check=result.as_dict(),
    ))

    if result.success:
        if option.get("clue") and option["clue"] not in state["clues"]:
            state["clues"].append(option["clue"])
            events.append(event("clue", "线索入档：" + option["clue"], "good"))
        events.append(event("story", option["success"], "info"))
        events.extend(_advance(card, scenario, state, roller))
    else:
        penalty = roller.roll("1d4").total
        state["corruption"] += penalty
        events.append(event("story", option["fail"], "warn"))
        events.append(event("corruption", "阴浊 +%d。你刚才那一下，它记住了。" % penalty, "warn"))
        events.extend(_kp_tick(roller, state, in_combat=False))
    return events


def _do_draw(card, state, talisman_id) -> list[dict]:
    tal = talisman_mod.get(talisman_id)
    if not tal:
        return [event("warn", "没有这种符。", "warn")]
    if state["draw_pool"] < tal["draw_cost"]:
        return [event("warn", "今日符力不够了（剩 %d）。" % state["draw_pool"], "warn")]
    state["draw_pool"] -= tal["draw_cost"]
    inventory = state.setdefault("inventory", {})
    inventory[talisman_id] = inventory.get(talisman_id, 0) + 1
    return [event(
        "draw",
        "画好一张「%s」，符力剩 %d。" % (tal["name"], state["draw_pool"]),
        "good",
        talisman=talisman_id,
    )]


def _advance(card, scenario, state, roller) -> list[dict]:
    """推进到下一场。遇到战斗场就召唤祟物。"""
    next_index = state["scene_index"] + 1
    if next_index >= len(scenario["scenes"]):
        return _finalize(card, scenario, state, roller)
    state["scene_index"] = next_index
    state["summon"] = None
    state["ward"] = 0
    nxt = scenario["scenes"][next_index]
    events = [event("scene", "%s｜%s" % (nxt.get("place", ""), nxt["name"]), "info")]
    if nxt.get("kind") == "combat":
        monster = bestiary_mod.get(nxt["enemy"])
        if monster:
            state["enemy"] = {
                "id": monster["id"],
                "name": monster["name"],
                "element": monster["element"],
                "hp": int(monster["hp"]),
                "max_hp": int(monster["hp"]),
                "boost": 0,
            }
            state["round"] = 0
            state["corruption"] += 3
            events.append(event(
                "encounter",
                "遭遇：%s（%s）——%s" % (monster["name"], monster["element"], monster["lore"]),
                "error",
                monster=monster["id"],
            ))
    elif nxt.get("kind") == "ending":
        events.extend(_finalize(card, scenario, state, roller))
    return events


def _kp_tick(roller, state, in_combat: bool) -> list[dict]:
    result = kp.event(roller, state["corruption"], in_combat)
    if not result:
        return []
    effect = result["effect"]
    events = [event("kp", "【KP】" + result["text"], result["severity"], kp=result["id"])]

    if effect.get("corruption"):
        state["corruption"] += int(effect["corruption"])
    if effect.get("san"):
        loss = roller.roll(effect["san"]).total
        state["san"] -= loss
        events.append(event("san", "理智 −%d。" % loss, "warn"))
    if effect.get("clue") and effect["clue"] not in state["clues"]:
        state["clues"].append(effect["clue"])
        events.append(event("clue", "线索入档：" + effect["clue"], "good"))
    if effect.get("enemy_boost") and state.get("enemy"):
        state["enemy"]["boost"] = int(state["enemy"].get("boost", 0)) + 1
        state["enemy"]["hp"] = min(
            state["enemy"]["max_hp"], state["enemy"]["hp"] + 4
        )
    return events


# ---------------------------------------------------------------- 战斗

ATTACKS = {
    "attack:melee": {
        "label": "贴身强攻", "skill": "melee", "damage": "1d8", "scale": "str",
        "div": 4, "type": "physical", "element": None, "mp": 0, "jianyi": 0, "shaqi": 0,
    },
    "attack:spell": {
        "label": "法术直取", "skill": "spell", "damage": "2d6", "scale": "wil",
        "div": 3, "type": "spell", "element": "self", "mp": 3, "jianyi": 0, "shaqi": 0,
    },
    "attack:blade": {
        "label": "御剑", "skill": "blade", "damage": "2d6", "scale": "wil",
        "div": 3, "type": "spell", "element": "金", "mp": 0, "jianyi": 2, "shaqi": 0,
    },
    "attack:hidden": {
        "label": "暗器出手", "skill": "hidden", "damage": "1d6+2", "scale": "agi",
        "div": 4, "type": "physical", "element": None, "mp": 0, "jianyi": 0, "shaqi": 2,
    },
}


def _pay(state: dict, spec: dict) -> bool:
    if state["mp"] < spec.get("mp", 0):
        return False
    if state["jianyi"] < spec.get("jianyi", 0):
        return False
    if state["shaqi"] < spec.get("shaqi", 0):
        return False
    state["mp"] -= spec.get("mp", 0)
    state["jianyi"] -= spec.get("jianyi", 0)
    state["shaqi"] -= spec.get("shaqi", 0)
    return True


def _summon_bonus(state: dict) -> float:
    summon = state.get("summon")
    if not summon:
        return 0.0
    return float(summon.get("force", 0)) / 100.0


def _strike(card, state, roller, skill_id, damage_dice, scale_key, div, dtype, element) -> dict:
    """一次攻击的完整结算：命中 → 伤害 → 五行 → 形态门槛。"""
    monster = bestiary_mod.get(state["enemy"]["id"])
    enemy = state["enemy"]
    phase = bestiary_mod.phase_for(monster, enemy["hp"])

    target = sheet.skill_value(card, skill_id) + wuxing.check_modifier(element, enemy["element"])
    result = checks.resolve(roller, sheet.SKILLS[skill_id][0], target, 0, reason="攻击")

    out = {"result": result, "hit": result.success, "damage": 0, "notes": [], "roll": None}
    if not result.success:
        out["notes"].append("没打中。" if result.level != "大失败" else "手一抖，反而被它抓住了空档。")
        if result.level == "大失败":
            state["san"] -= 1
        return out

    roll = roller.roll(damage_dice, "伤害")
    base = roll.total + int(card.get("attrs", {}).get(scale_key, 10)) // div
    items = shop_mod.effects_of(card)
    base += int(items["damage_vs"].get(enemy["element"], 0)) + int(items["damage_flat"])
    mult = wuxing.multiplier(element, enemy["element"])
    gate = bestiary_mod.state_gate(phase["state"], dtype)
    summon = 1.0 + _summon_bonus(state)
    raw = base * mult * gate * summon
    if result.level == "大成功":
        raw *= 2
    damage = max(0, int(round(raw)))

    if mult > 1:
        out["notes"].append(wuxing.describe(element, enemy["element"]))
    if gate == 0:
        out["notes"].append("%s之下，这种打法根本碰不到它。" % phase["state"])
    elif gate < 1:
        out["notes"].append("%s，伤害被宿主分掉了一半。" % phase["state"])

    enemy["hp"] = max(0, enemy["hp"] - damage)
    out["damage"] = damage
    out["roll"] = roll.as_dict()
    out["phase"] = phase["state"]
    return out


def _do_combat(card, scenario, state, scene, action_id, roller) -> list[dict]:
    head, _, arg = action_id.partition(":")
    events: list[dict] = []

    if head == "flee":
        return _do_flee(card, scenario, state, scene, roller)

    if head == "ward":
        if state["mp"] < 2:
            return [event("warn", "灵力不够结界的。", "warn")]
        state["mp"] -= 2
        state["ward"] = 3
        return [event("ward", "戊土之气贴地而起，结界成形（三回合减伤）。", "good")]

    if head == "summon":
        return _do_summon(card, state, arg, roller)

    if head == "env":
        return _do_env(card, state, roller)

    if head == "talisman":
        tal = talisman_mod.get(arg)
        if not tal:
            return [event("warn", "没有这种符。", "warn")]
        if state["inventory"].get(arg, 0) <= 0:
            return [event("warn", "这张符已经用完了。", "warn")]
        if state["mp"] < tal["use_cost"]:
            return [event("warn", "灵力不够引动这张符。", "warn")]
        state["mp"] -= tal["use_cost"]
        state["inventory"][arg] -= 1
        if state["inventory"][arg] <= 0:
            del state["inventory"][arg]
        events.append(event("talisman", "引动「%s」（%s）" % (tal["name"], tal["element"]), "info"))
        events.extend(_resolve_talisman(card, state, tal, roller))
    elif action_id in ATTACKS:
        spec = ATTACKS[action_id]
        if not _pay(state, spec):
            return [event("warn", "资源不够，这招发不出来。", "warn")]
        element = card.get("element") if spec["element"] == "self" else spec["element"]
        events.append(event("attack", "你选择了「%s」。" % spec["label"], "info"))
        strike = _strike(card, state, roller,
                         spec["skill"], spec["damage"], spec["scale"],
                         spec["div"], spec["type"], element)
        events.extend(_strike_events(strike, element))
    else:
        return [event("warn", "战斗中做不了这个。", "warn")]

    # 敌方回合
    if state["enemy"] and state["enemy"]["hp"] > 0:
        events.extend(_enemy_turn(card, state, roller))
    if state["enemy"] and state["enemy"]["hp"] <= 0:
        state["enemy"] = None
        state.pop("round", None)
        events.append(event("clear", "它散了。空气里的那股凉意退得干干净净。", "good"))
        events.extend(_advance(card, scenario, state, roller))
    events.extend(_force_reveal(state))
    events.extend(_kp_tick(roller, state, in_combat=True))
    return events


def _force_reveal(state: dict) -> list[dict]:
    """打不动它，就得逼它现形：每三回合它退一阶形态。

    没有这条，灵体态会变成死循环 —— 物理免疫，而玩家手上未必有符。
    """
    enemy = state.get("enemy")
    if not enemy:
        return []
    state["round"] = int(state.get("round", 0)) + 1
    if state["round"] % 3:
        return []

    monster = bestiary_mod.get(enemy["id"])
    phases = monster["phases"]
    index = bestiary_mod.phase_index(monster, enemy["hp"])
    if index >= len(phases) - 1:
        return []

    total = enemy["max_hp"]
    if len(phases) == 3:
        target = int(total * (0.59 if index == 0 else 0.29))
    else:
        target = int(total * 0.44)
    enemy["hp"] = min(enemy["hp"], max(1, target))
    state["corruption"] += 2
    return [
        event("reveal", "你缠了它这么久，它的边缘开始发虚——被你逼得退了一阶形态。", "good"),
        event("corruption", "阴浊 +2。跟它耗着的每一秒都在往你身上渗。", "warn"),
    ]


def _strike_events(strike: dict, element) -> list[dict]:
    result = strike["result"]
    events = [event("check", checks.describe(result), "good" if result.success else "warn",
                    check=result.as_dict())]
    for note in strike["notes"]:
        events.append(event("note", note, "info"))
    if strike["hit"]:
        events.append(event("damage", "造成 %d 点伤害。" % strike["damage"],
                            "good" if strike["damage"] > 0 else "warn"))
    return events


def _resolve_talisman(card, state, tal, roller) -> list[dict]:
    events = []
    kind = tal["kind"]
    if kind == "damage":
        strike = _strike(card, state, roller, "arcana", tal["damage"], tal["scale"] or "wil",
                         3, "talisman", tal["element"])
        events.extend(_strike_events(strike, tal["element"]))
    elif kind == "heal":
        amount = roller.roll(tal["damage"]).total + int(card.get("attrs", {}).get("wil", 10)) // 3
        state["hp"] += amount
        events.append(event("heal", "气血回复 %d。" % amount, "good"))
    elif kind == "ward":
        state["ward"] = max(state["ward"], 3)
        events.append(event("ward", "结界成形，三回合内减伤。", "good"))
    elif kind == "reveal":
        enemy = state.get("enemy")
        if enemy:
            monster = bestiary_mod.get(enemy["id"])
            phase = bestiary_mod.phase_for(monster, enemy["hp"])
            events.append(event("reveal", "净秽之下，它的形态清楚了：%s。" % phase["label"], "good"))
            enemy["hp"] = max(0, enemy["hp"] - 2)
    elif kind == "calm":
        state["san"] = min(state["san_max"], state["san"] + 4)
        events.append(event("calm", "安神符压住了那阵耳鸣，理智 +4。", "good"))
    elif kind == "control":
        enemy = state.get("enemy")
        if enemy:
            monster = bestiary_mod.get(enemy["id"])
            phase = bestiary_mod.phase_for(monster, enemy["hp"])
            if phase["state"] == "实体":
                enemy["stunned"] = 1
                events.append(event("control", "定身符贴中，它定在原地。", "good"))
            else:
                events.append(event("note", "它是%s，符纸直接穿了过去。" % phase["state"], "warn"))
    return events


def _do_summon(card, state, spirit_id, roller) -> list[dict]:
    spirit = spirits_mod.get(spirit_id)
    if not spirit:
        return [event("warn", "叫不来这位。", "warn")]
    if spirits_mod.RANKS.index(spirit["rank"]) > spirits_mod.RANKS.index(card.get("rank", "初真")):
        return [event("warn", "你的箓职还不够请这位。", "warn")]
    approval = int(card.get("approval", {}).get(spirit_id, 0))
    cost = spirits_mod.approval_cost(spirit, approval)
    discount = int(shop_mod.effects_of(card)["summon_discount"])
    cost = max(1, cost - discount)
    if state["mp"] < cost:
        return [event("warn", "灵力不够请神。", "warn")]

    state["mp"] -= cost
    ratio = spirits_mod.inherit_ratio(approval)
    state["summon"] = {
        "id": spirit_id,
        "name": spirit["name"],
        "approval": approval,
        "turns": 3,
        "force": round(int(spirit["panel"]["武力"]) * ratio),
        "ward": round(int(spirit["panel"]["道法"]) * ratio / 100.0, 2),
    }
    state["ward"] = max(state["ward"], 3)
    return [
        event("summon", "%s 上身。你听见自己的声音里混了别人的口音。" % spirit["name"], "good",
              spirit=spirit_id),
        event("note", "能力继承 %.0f%%，持续三回合。" % (ratio * 100), "info"),
    ]


def _do_env(card, state, roller) -> list[dict]:
    target = sheet.skill_value(card, "investigate")
    result = checks.resolve(roller, "侦查", target, 0, reason="借环境")
    events = [event("check", checks.describe(result), "good" if result.success else "warn")]
    if not result.success:
        return events
    enemy = state.get("enemy")
    monster = bestiary_mod.get(enemy["id"])
    phase = bestiary_mod.phase_for(monster, enemy["hp"])
    options = {
        "灵体": ("你摸到墙上的总闸，一把拉下。整层陷入黑暗，它的轮廓反而淡了。", 4),
        "附身": ("你砸开消防栓，水压把附着的那面墙冲得裂开，它的根断了。", 6),
        "实体": ("你抄起墙角的灭火器，干粉糊了它一脸。", 5),
    }
    text, bonus = options.get(phase["state"], ("你抓住了一个稍纵即逝的空档。", 3))
    enemy["hp"] = max(0, enemy["hp"] - bonus)
    events.append(event("env", text + "（造成 %d 点伤害）" % bonus, "good"))
    return events


def _do_flee(card, scenario, state, scene, roller) -> list[dict]:
    target = sheet.skill_value(card, "athletics")
    result = checks.resolve(roller, "身法", target, 0, reason="脱离")
    events = [event("check", checks.describe(result), "good" if result.success else "warn")]
    if result.success:
        events.append(event("flee", "你退了出来。代价是这一趟的记录不好看。", "warn"))
        state["corruption"] += 6
        state["enemy"] = None
        events.extend(_advance(card, scenario, state, roller))
    else:
        events.append(event("flee", "你没跑掉。", "error"))
        events.extend(_enemy_turn(card, state, roller))
    return events


def _enemy_turn(card, state, roller) -> list[dict]:
    enemy = state.get("enemy")
    if not enemy:
        return []
    if enemy.get("stunned"):
        enemy["stunned"] = 0
        return [event("note", "它还在挣扎，这一回合动不了。", "info")]

    monster = bestiary_mod.get(enemy["id"])
    phase = bestiary_mod.phase_for(monster, enemy["hp"])
    attack = phase["attack"]

    skill_id = "resist" if attack["type"] == "spirit" else "athletics"
    target = sheet.skill_value(card, skill_id) + 10 * int(enemy.get("boost", 0))
    result = checks.resolve(roller, sheet.SKILLS[skill_id][0], target, 0, reason=attack["name"])
    events = [event("check", checks.describe(result), "good" if result.success else "error")]
    if result.success:
        events.append(event("note", "你避开了：「%s」落空。" % attack["name"], "info"))
        return events

    roll = roller.roll(attack["dice"], attack["name"])
    damage = roll.total + int(enemy.get("boost", 0)) * 2
    if state["ward"] > 0:
        damage = damage // 2
        state["ward"] = max(0, state["ward"] - 1)
    damage = max(0, int(damage))
    state["hp"] -= damage
    events.append(event("hurt", "%s｜%s 落在你身上，气血 −%d。" % (
        attack["name"], attack.get("text", ""), damage), "error", damage=damage))

    if attack.get("san"):
        loss = roller.roll(str(attack["san"]).split("/")[-1]).total
        state["san"] -= loss
        events.append(event("san", "理智 −%d。" % loss, "warn"))

    if state["hp"] <= 0:
        events.append(event("down", "你倒下了。", "error"))
    return events


# ---------------------------------------------------------------- 抉择与结算

def _do_choice(card, scenario, state, scene, choice_id, roller) -> list[dict]:
    choice = next((c for c in scene.get("choices", []) if c["id"] == choice_id), None)
    if not choice:
        return [event("warn", "没有这个选项。", "warn")]

    state["karma"].append({"id": choice["id"], "karma": choice.get("karma", "")})
    state.setdefault("merit_delta", 0)
    state["merit_delta"] += int(choice.get("merit", 0))
    state["corruption"] += int(choice.get("corruption", 0))

    events = [event("choice", choice["text"], "info")]
    events.append(event(
        "karma",
        "因果记为「%s」，功德 %+d，阴浊 %+d。" % (
            choice.get("karma", "未定"), choice.get("merit", 0), choice.get("corruption", 0)),
        "good" if choice.get("merit", 0) > 0 else "warn",
    ))
    events.extend(_advance(card, scenario, state, roller))
    return events


def _finalize(card, scenario, state, roller) -> list[dict]:
    state["status"] = DONE
    state["enemy"] = None

    if state["hp"] <= 0:
        grade = "bad"
        reason = "气血耗尽，你没能活着出来。"
    else:
        score = (
            len(state["clues"]) * 5
            + int(state.get("merit_delta", 0))
            - state["corruption"] // 4
            - (state["hp_max"] - state["hp"]) // 5
        )
        if score >= 24:
            grade = "good"
        elif score >= 8:
            grade = "neutral"
        else:
            grade = "bad"
        reason = "线索 %d 条，功德 %+d，阴浊 %d。" % (
            len(state["clues"]), int(state.get("merit_delta", 0)), state["corruption"])

    base_award = {"good": 8, "neutral": 4, "bad": 1}[grade]
    award = max(0, base_award + int(state.get("merit_delta", 0)))
    state["ending"] = {
        "grade": grade,
        "reason": reason,
        "text": scenario.get("endings", {}).get(grade, "案子结了。"),
        "merit_award": award,
        "clues": len(state["clues"]),
        "karma": [k.get("karma", "") for k in state.get("karma", [])],
    }
    label = {"good": "善了", "neutral": "了结", "bad": "未了"}[grade]
    return [
        event("ending", "结案：%s" % label, "good" if grade == "good" else "warn",
              grade=grade),
        event("story", state["ending"]["text"], "info"),
        event("note", reason, "info"),
        event("merit", "本场记功德 +%d。" % award, "good", award=award),
    ]

