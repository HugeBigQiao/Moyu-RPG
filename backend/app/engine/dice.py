"""骰子与可复现随机源。

整个系统的随机性都从这里出去：跑团回放、抽卡、KP 事件表共用同一套
`Roller`，每次掷骰都会留痕，所以一局可以完整回放、也可以复现 bug。
"""

from __future__ import annotations

import hashlib
import random
import re
from dataclasses import dataclass, field

DICE_RE = re.compile(r"^\s*(?P<n>\d*)d(?P<side>\d+)(?P<mod>[+-]\d+)?\s*$", re.I)


@dataclass
class Roll:
    """一次掷骰的留痕记录。"""

    notation: str
    rolls: list[int]
    modifier: int
    total: int
    reason: str = ""

    def as_dict(self) -> dict:
        return {
            "notation": self.notation,
            "rolls": self.rolls,
            "modifier": self.modifier,
            "total": self.total,
            "reason": self.reason,
        }


@dataclass
class Roller:
    """带种子的骰子。种子相同则整局结果相同。"""

    seed: str = ""
    _rng: random.Random = field(default=None, repr=False)
    history: list[Roll] = field(default_factory=list)

    def __post_init__(self) -> None:
        if self._rng is None:
            digest = hashlib.sha256(self.seed.encode("utf-8")).hexdigest()
            self._rng = random.Random(int(digest[:16], 16))

    # ---- 基础 ----
    def d(self, sides: int, reason: str = "") -> int:
        value = self._rng.randint(1, sides)
        self.history.append(Roll(f"1d{sides}", [value], 0, value, reason))
        return value

    def roll(self, notation: str, reason: str = "") -> Roll:
        match = DICE_RE.match(notation)
        if not match:
            raise ValueError("看不懂的骰子写法：%r（要 2d6+3 这种）" % notation)
        count = int(match.group("n") or 1)
        sides = int(match.group("side"))
        modifier = int(match.group("mod") or 0)
        if count < 1 or count > 50 or sides < 2:
            raise ValueError("骰子参数不合理：%r" % notation)
        rolls = [self._rng.randint(1, sides) for _ in range(count)]
        total = sum(rolls) + modifier
        record = Roll(notation, rolls, modifier, total, reason)
        self.history.append(record)
        return record

    def d100(self, reason: str = "") -> int:
        value = self._rng.randint(1, 100)
        self.history.append(Roll("1d100", [value], 0, value, reason))
        return value

    def choice(self, seq, reason: str = ""):
        seq = list(seq)
        if not seq:
            raise ValueError("从空列表里抽不出东西")
        index = self._rng.randrange(len(seq))
        self.history.append(Roll("choice", [index], 0, index, reason))
        return seq[index]

    def weighted(self, pairs, reason: str = ""):
        """pairs: [(value, weight), ...]"""
        pairs = [(v, w) for v, w in pairs if w > 0]
        if not pairs:
            raise ValueError("权重全是 0")
        total = sum(w for _, w in pairs)
        pick = self._rng.uniform(0, total)
        acc = 0.0
        for value, weight in pairs:
            acc += weight
            if pick <= acc:
                self.history.append(Roll("weighted", [0], 0, 0, reason))
                return value
        self.history.append(Roll("weighted", [0], 0, 0, reason))
        return pairs[-1][0]

    def shuffle(self, items: list, reason: str = "") -> list:
        out = list(items)
        self._rng.shuffle(out)
        self.history.append(Roll("shuffle", [0], 0, 0, reason))
        return out

    def sample(self, seq, k: int, reason: str = "") -> list:
        seq = list(seq)
        k = min(k, len(seq))
        picked = self._rng.sample(seq, k)
        self.history.append(Roll("sample", [0], 0, 0, reason))
        return picked

    def randint(self, low: int, high: int, reason: str = "") -> int:
        value = self._rng.randint(low, high)
        self.history.append(Roll(f"{low}-{high}", [value], 0, value, reason))
        return value

    def pool(self, count: int, sides: int, reason: str = "") -> list[int]:
        """一次掷一组骰子，只在历史里留一条记录（属性生成用）。"""
        values = [self._rng.randint(1, sides) for _ in range(count)]
        self.history.append(Roll(f"{count}d{sides}", values, 0, sum(values), reason))
        return values

    def chance(self, probability: float, reason: str = "") -> bool:
        """按概率掷一次是/否。"""
        raw = self._rng.random()
        pct = int(round(raw * 100))
        self.history.append(Roll("chance", [pct], 0, pct, reason))
        return raw < max(0.0, min(1.0, probability))


def roll4d6_drop_lowest(roller: Roller) -> int:
    """经典 4d6 去最低，落在 3-18。"""
    rolls = sorted(roller.pool(4, 6, "属性生成"))
    dropped = rolls[0]
    total = sum(rolls[1:])
    roller.history[-1].total = total
    roller.history[-1].reason = "4d6↓（丢 %d）" % dropped
    return total


def new_seed() -> str:
    return "%016x" % random.SystemRandom().getrandbits(64)
