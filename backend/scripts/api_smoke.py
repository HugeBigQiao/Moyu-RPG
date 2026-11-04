"""走 HTTP 打一局完整的，顺便把世界层接口都验一遍。

    cd backend && uv run python scripts/api_smoke.py [base_url]
"""

from __future__ import annotations

import sys

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8770"
PRIORITY = {"attack": 0, "talisman": 1, "summon": 2, "check": 3, "choice": 3,
            "env": 4, "ward": 5}

PASS = 0
FAIL = 0


def check(name: str, ok: bool, detail: str = "") -> None:
    global PASS, FAIL
    if ok:
        PASS += 1
        print("  ok   %s" % name)
    else:
        FAIL += 1
        print("  FAIL %s %s" % (name, detail))


def main() -> int:
    c = httpx.Client(base_url=BASE, timeout=20.0)

    print("1) 前端与接口")
    r = c.get("/")
    check("GET / 返回 SPA", r.status_code == 200 and '<div id="app">' in r.text)
    r = c.get("/api/dashboard")
    check("GET /api/dashboard", r.status_code == 200 and "totals" in r.json())

    print("2) 世界层")
    w = c.get("/api/world").json()
    check("国家/教派/机构/人物齐备",
          all(w[k] for k in ("nations", "sects", "agencies", "figures")))
    check("城市分级 5 档", len(w["tiers"]) == 5)
    check("特级事件上限 10", w["tiers"][0]["max_events"] == 10)
    ev = c.get("/api/events").json()
    check("事件库非空", len(ev["events"]) > 10)
    check("事件有等级", all(e["grade"] in (1, 2, 3, 4) for e in ev["events"]))
    ms = c.get("/api/missions").json()
    check("任务库非空", len(ms["missions"]) >= 5)

    print("3) 随机人物")
    npcs = c.post("/api/npcs", json={"count": 3, "city": "linjing"}).json()
    check("生成 3 人", npcs["created"] == 3)
    top = npcs["people"][0]
    check("带出身事件", len(top["events"]) >= 1)
    check("有难度与报酬", top["difficulty"] >= 1 and top["reward"] >= 5)
    check("事件数不超过特级上限", all(len(p["events"]) <= 10 for p in npcs["people"]))

    small = c.post("/api/npcs", json={"count": 3, "city": "banqiao"}).json()
    check("四级城市最多 2 条事件", all(len(p["events"]) <= 2 for p in small["people"]))

    print("4) 玩家自建")
    payload = {
        "name": "沈砚", "school": "fulu", "element": "火", "city": "nanyu",
        "attrs": {"str": 12, "agi": 12, "con": 12, "int": 12, "wil": 12, "per": 12},
        "events": [], "notes": "自建测试",
    }
    made = c.post("/api/characters", json=payload)
    check("建档成功", made.status_code == 200, made.text[:150])
    cid = made.json()["id"]

    bad = dict(payload)
    bad["attrs"] = {"str": 18, "agi": 12, "con": 12, "int": 12, "wil": 12, "per": 12}
    check("点数不对要被拒", c.post("/api/characters", json=bad).status_code == 400)

    print("5) 角色卡")
    sheet = c.get("/api/characters/%d" % cid).json()
    check("六维属性", len(sheet["attrs"]) == 6)
    check("出身城市", sheet["city"]["id"] == "nanyu")
    check("商店货架", len(sheet["shelf"]) > 0)

    print("6) 开团打一局")
    r = c.post("/api/sessions", json={"character_id": cid, "scenario_id": "mirror"})
    check("开团", r.status_code == 200, r.text[:120])
    sid = r.json()["id"]

    rounds = 0
    while rounds < 120:
        rounds += 1
        state = c.get("/api/sessions/%d" % sid).json()
        if state["status"] != "active":
            break
        usable = [a for a in state["view"]["actions"] if a["enabled"]]
        if not usable:
            check("还有可用操作", False, "卡住了")
            break
        usable.sort(key=lambda a: PRIORITY.get(a["kind"], 9))
        r = c.post("/api/sessions/%d/act" % sid, json={"action": usable[0]["id"]})
        if r.status_code != 200:
            check("行动返回 200", False, r.text[:200])
            break

    final = c.get("/api/sessions/%d" % sid).json()
    check("一局结束", final["status"] == "done", "rounds=%d" % rounds)
    check("有结局", bool(final["view"].get("ending")))

    print("7) 成长线")
    buy = c.post("/api/characters/%d/buy" % cid, json={"item_id": "dingshen_dan"})
    check("兑换接口有明确回应", buy.status_code in (200, 400), buy.text[:80])
    check("心魔试炼可执行", c.post("/api/characters/%d/trial" % cid).status_code == 200)
    check("晋升接口有明确回应",
          c.post("/api/characters/%d/promote" % cid).status_code in (200, 400))

    print("\n结果：%d 通过 / %d 失败" % (PASS, FAIL))
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
