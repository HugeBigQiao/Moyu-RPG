"""剧本数据加载器。

职责：
    读固定剧本（场景流、结局），供固定任务与随机任务复用结构。
为什么需要：
    剧本是跑团的本体，单独一份 JSON 便于写作与校对。
上下游：
    上游：data/content/scenarios.json；下游：api/sessions、engine/mission、content/missions。
"""


from __future__ import annotations

from ._store import load, register

SCENARIOS: list[dict] = []
SCENARIO_BY_ID: dict[str, dict] = {}


def apply(force: bool = False) -> None:
    global SCENARIOS, SCENARIO_BY_ID
    SCENARIOS = load("scenarios", force)["scenarios"]
    SCENARIO_BY_ID = {s["id"]: s for s in SCENARIOS}


def get(scenario_id: str) -> dict | None:
    return SCENARIO_BY_ID.get(scenario_id)


def first_of_kind(scenario: dict, kind: str) -> dict | None:
    for scene in scenario["scenes"]:
        if scene["kind"] == kind:
            return scene
    return None


register("scenarios", apply)
apply()
