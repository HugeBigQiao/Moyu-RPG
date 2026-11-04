"""无数据库的冒烟测试：抽一张卡，自动打完整局，打印事件流。

    uv run python scripts/smoke.py [scenario_id] [seed]
"""

from __future__ import annotations

import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from app.content import scenario as scenario_mod  # noqa: E402
from app.engine import gacha, session, sheet  # noqa: E402


def play(scenario_id: str = "mirror", seed: str = "smoke-1", verbose: bool = True) -> dict:
    card = gacha.roll(seed=seed)
    scenario = scenario_mod.get(scenario_id)
    assert scenario, "没有这个剧本：%s" % scenario_id

    state = session.new_state(card, scenario, seed=seed)
    if verbose:
        stats = sheet.derived(card)
        print("=" * 78)
        print("卡：%s（%s · %s · %s）" % (
            card["name"], sheet.SCHOOLS[card["school"]]["name"], card["element"], card["rarity"]))
        print("箓职 %s｜气血 %d｜灵力 %d｜理智 %d｜阴浊 %d" % (
            card["rank"], stats["hp_max"], stats["mp_max"], stats["san_max"],
            state["corruption"]))
        print("=" * 78)

    guard = 0
    while state["status"] == "active" and guard < 300:
        guard += 1
        options = session.view(card, scenario, state)["actions"]
        usable = [o for o in options if o["enabled"]]
        if not usable:
            if verbose:
                print("……没有可用行动，卡住了。")
            break
        # 简单策略：优先战斗用的招，其次勘查，最后画符
        def rank(o):
            return {"attack": 0, "talisman": 0, "summon": 0, "check": 1,
                    "choice": 1, "env": 2, "ward": 3, "flee": 9, "draw": 8}.get(o["kind"], 5)

        usable.sort(key=rank)
        action = usable[0]
        state, events = session.act(card, scenario, state, action["id"])
        if verbose:
            print("\n▶ %s" % action["label"])
            for ev in events:
                print("   [%s] %s" % (ev["severity"], ev["text"]))
        if not events:
            print("   （无事发生）")

    if verbose:
        print("\n" + "=" * 78)
        print("回合数 %d｜线索 %d｜阴浊 %d｜气血 %d/%d" % (
            state["turn"], len(state["clues"]), state["corruption"],
            state["hp"], state["hp_max"]))
        if state["ending"]:
            print("结局：[%s] %s" % (state["ending"]["grade"], state["ending"]["text"]))
        print("=" * 78)

    assert state["status"] == "done", "一局没有正常结束"
    assert state["ending"], "没有结局"
    return {"card": card, "state": state}


if __name__ == "__main__":
    sid = sys.argv[1] if len(sys.argv) > 1 else "mirror"
    sd = sys.argv[2] if len(sys.argv) > 2 else "smoke-1"
    play(sid, sd)
