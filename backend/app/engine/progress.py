"""成长线。

职责：
    授箓晋升、心魔试炼、功德商店结算。
为什么需要：
    成长规则与人物状态强相关，集中一处才好平衡。
上下游：
    上游：content/{spirits,shop,traits}、sheet；下游：api/characters。
"""


from __future__ import annotations

from . import checks, sheet
from .dice import Roller

TRIAL_ROLLS = 3
TRIAL_NEEDED = 2


def next_rank(rank: str) -> str | None:
    if rank not in sheet.RANKS:
        rank = "初真"
    index = sheet.RANKS.index(rank)
    if index + 1 >= len(sheet.RANKS):
        return None
    return sheet.RANKS[index + 1]


def _get(ch: dict, key: str, default=0):
    return ch.get(key, default) or default


def requirements(ch: dict) -> list[dict]:
    """下一级箓职的要求 + 当前进度。已经是天师则返回空。"""
    nxt = next_rank(ch.get("rank", "初真"))
    if not nxt:
        return []

    sessions = _get(ch, "completed_sessions")
    merit = _get(ch, "merit")
    good = _get(ch, "karma_good")
    trial = bool(ch.get("mind_trial_passed"))

    if nxt == "盟威":
        rows = [
            {"key": "sessions", "label": "完成驱祟任务", "have": sessions, "need": 3, "unit": "次"},
        ]
    elif nxt == "五雷":
        rows = [
            {"key": "merit", "label": "功德", "have": merit, "need": 50, "unit": ""},
            {"key": "trial", "label": "心魔试炼", "have": 1 if trial else 0, "need": 1, "unit": ""},
        ]
    else:  # 天师
        rows = [
            {"key": "merit", "label": "功德", "have": merit, "need": 80, "unit": ""},
            {"key": "karma", "label": "善果", "have": good, "need": 3, "unit": "件"},
            {"key": "sessions", "label": "完成驱祟任务", "have": sessions, "need": 8, "unit": "次"},
        ]

    for row in rows:
        row["ok"] = row["have"] >= row["need"]
        row["pct"] = min(100, round(row["have"] * 100 / max(1, row["need"])))
    return rows


def promotable(ch: dict) -> bool:
    rows = requirements(ch)
    return bool(rows) and all(r["ok"] for r in rows)


def promote(ch: dict) -> dict:
    """晋升一级。返回新的箓职和为此新开的英灵认可度。"""
    from ..content import spirits

    if not promotable(ch):
        raise ValueError("条件不够，晋不了。")
    old = ch.get("rank", "初真")
    new = next_rank(old)
    ch["rank"] = new

    approval = dict(ch.get("approval") or {})
    opened = []
    for spirit in spirits.SPIRITS:
        if spirit["rank"] == new and spirit["id"] not in approval:
            approval[spirit["id"]] = 10
            opened.append(spirit["name"])
    ch["approval"] = approval
    return {"from": old, "to": new, "opened": opened}


def trial(card: dict, seed: str) -> dict:
    """心魔试炼：三次精神抵抗，过两次。"""
    roller = Roller(seed=seed)
    target = sheet.skill_value(card, "resist")
    rolls = []
    passed = 0
    for i in range(TRIAL_ROLLS):
        result = checks.resolve(roller, "精神抵抗", target, 0, reason="心魔试炼第 %d 问" % (i + 1))
        rolls.append({
            "roll": result.roll,
            "target": result.target,
            "level": result.level,
            "success": result.success,
        })
        if result.success:
            passed += 1

    ok = passed >= TRIAL_NEEDED
    tales = {
        True: "三问两渡。你听见有人在很远的地方叫你的名字，你没回头。",
        False: "你在第二问上停住了。镜子里那个「你」比你更早抬起了头。",
    }
    return {
        "passed": ok,
        "passes": passed,
        "need": TRIAL_NEEDED,
        "rolls": rolls,
        "text": tales[ok],
    }


# ---------------------------------------------------------------- 商店

def buy(ch: dict, item_id: str) -> dict:
    """买一件。原地改 ch（调用方负责落库）。"""
    from ..content import shop

    spec = shop.get(item_id)
    if not spec:
        raise ValueError("货架上没有这件。")

    items = [dict(i) for i in (ch.get("items") or [])]
    entry = next((i for i in items if i["id"] == item_id), None)
    owned = int(entry["qty"]) if entry else 0
    if owned >= int(spec.get("max_qty", 1)):
        raise ValueError("这件你已经有了。")

    need = spec.get("requires_rank")
    if need and sheet.RANKS.index(need) > sheet.RANKS.index(ch.get("rank", "初真")):
        raise ValueError("箓职不够，买不了这件。")

    price = int(spec["price"])
    if price > int(ch.get("merit", 0)):
        raise ValueError("功德不够（差 %d）。" % (price - int(ch.get("merit", 0))))

    ch["merit"] = int(ch.get("merit", 0)) - price
    if entry:
        entry["qty"] = owned + 1
    else:
        items.append({"id": item_id, "name": spec["name"], "qty": 1})
    ch["items"] = items

    if spec.get("effect", {}).get("karma_debt"):
        ch["karma_debt"] = int(ch.get("karma_debt", 0)) + int(spec["effect"]["karma_debt"])

    return {"item": spec["name"], "spent": price, "left": ch["merit"]}
