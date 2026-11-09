"""剧本（从 content/scenarios.json 读）。

一个剧本 = 一串场景：investigate / combat / choice / ending。
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
