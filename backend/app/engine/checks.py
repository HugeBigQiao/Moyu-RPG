"""d100 检定。

沿用 COC 的阈值传统，但把五行对抗折进加值里：
    目标值 = 技能值 + 五行修正 + 环境修正
    ≤ 目标值/5   → 大成功
    ≤ 目标值/2   → 极难成功
    ≤ 目标值     → 困难成功
    ≤ 目标值×?   —— 不设普通成功，直接按 COC 的「成功/失败」两档
    ≥ 96         → 大失败（技能值 ≥ 50 时需 ≥ 100）
"""

from __future__ import annotations

from dataclasses import dataclass

from .dice import Roller

LEVELS = ("大成功", "极难成功", "困难成功", "成功", "失败", "大失败")


@dataclass
class CheckResult:
    skill: str
    target: int
    raw_target: int
    roll: int
    level: str
    success: bool
    modifier: int
    note: str = ""

    def as_dict(self) -> dict:
        return {
            "skill": self.skill,
            "target": self.target,
            "roll": self.roll,
            "level": self.level,
            "success": self.success,
            "modifier": self.modifier,
            "note": self.note,
        }

    @property
    def margin(self) -> int:
        return self.target - self.roll


def resolve(
    roller: Roller,
    skill: str,
    skill_value: int,
    modifier: int = 0,
    note: str = "",
    reason: str = "",
) -> CheckResult:
    raw = max(1, min(99, int(skill_value)))
    target = max(1, min(99, raw + modifier))
    roll = roller.d100(reason or skill)

    fumble_at = 100 if target >= 50 else 96
    if roll >= fumble_at:
        level = "大失败"
    elif roll <= max(1, target // 5):
        level = "大成功"
    elif roll <= max(1, target // 2):
        level = "极难成功"
    elif roll <= target:
        level = "困难成功"
    else:
        level = "失败"

    return CheckResult(
        skill=skill,
        target=target,
        raw_target=raw,
        roll=roll,
        level=level,
        success=level != "失败" and level != "大失败",
        modifier=modifier,
        note=note,
    )


def describe(result: CheckResult) -> str:
    head = "【%s】%d / 目标 %d（%+d）→ %s" % (
        result.skill,
        result.roll,
        result.target,
        result.modifier,
        result.level,
    )
    if result.note:
        head += "｜" + result.note
    return head


def skill_color(level: str) -> str:
    return {
        "大成功": "crit",
        "极难成功": "great",
        "困难成功": "good",
        "成功": "ok",
        "失败": "miss",
        "大失败": "fumble",
    }.get(level, "ok")
