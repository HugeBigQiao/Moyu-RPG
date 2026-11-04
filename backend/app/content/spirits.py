"""英灵与授箓。

正一授箓的层级决定了「你能请到谁」：
    初真 —— 谁也叫不动
    盟威 —— 城隍、土地、灶神这类地方神
    五雷 —— 历代名将
    天师 —— 神话级

认可度（0-100）是三件事的旋钮：能力继承比例、灵力消耗、副作用轻重。
"""

from __future__ import annotations

from ..engine.sheet import RANKS

SPIRITS = [
    {
        "id": "tudi",
        "name": "土地公",
        "rank": "盟威",
        "element": "土",
        "title": "当境土地",
        "panel": {"武力": 25, "道法": 40, "神识": 55},
        "abilities": ["镇宅：全队减伤 20%，持续 3 回合", "指路：立刻得知最近的祟物方位"],
        "creed": "护一方水土，最厌糟蹋乡里、欺辱老弱之人。",
        "cost": 3,
        "side_effect": "香火寡淡，请完只是累，不伤身。",
    },
    {
        "id": "chenghuang",
        "name": "城隍",
        "rank": "盟威",
        "element": "土",
        "title": "一城之主",
        "panel": {"武力": 40, "道法": 50, "神识": 60},
        "abilities": ["阴司拘令：对亡魂类祟物直接压制一回合", "城狐社鼠：召两只阴差协战"],
        "creed": "秉公断案，不徇私，不容以强凌弱以外的任何事。",
        "cost": 4,
        "side_effect": "断案不公者，出窍后三日内诸事不顺。",
    },
    {
        "id": "bianque",
        "name": "扁鹊",
        "rank": "盟威",
        "element": "木",
        "title": "医仙",
        "panel": {"武力": 15, "道法": 70, "神识": 50},
        "abilities": ["起沉疴：恢复 3d6 气血，净化中毒与低阶诅咒"],
        "creed": "见死不救者，永不再应。",
        "cost": 3,
        "side_effect": "施术者自身承一半病气。",
    },
    {
        "id": "guanyu",
        "name": "关圣帝君",
        "rank": "五雷",
        "element": "金",
        "title": "武圣",
        "panel": {"武力": 90, "道法": 30, "神识": 70},
        "abilities": ["青龙偃月：对群体造成贯穿伤害，额外 3 灵力", "义薄云天：三回合内免疫恐惧与威压"],
        "creed": "重然诺、护忠良。见背信弃义、坐视同袍受难者，认可度骤降。",
        "cost": 9,
        "side_effect": "武圣附体，气血翻腾：结束后体质检定，失败则脏器出血。",
    },
    {
        "id": "yuefei",
        "name": "岳武穆",
        "rank": "五雷",
        "element": "金",
        "title": "精忠",
        "panel": {"武力": 85, "道法": 35, "神识": 75},
        "abilities": ["撼山易：一次攻击必定命中，伤害取满值", "背嵬军令：全队先攻权 +3"],
        "creed": "忠义两全。临阵脱逃者不请自来。",
        "cost": 8,
        "side_effect": "请神期间不可后退，撤退即视为失义。",
    },
    {
        "id": "zhongkui",
        "name": "钟馗",
        "rank": "天师",
        "element": "煞",
        "title": "赐福镇宅圣君",
        "panel": {"武力": 70, "道法": 80, "神识": 90},
        "abilities": ["啖鬼：对灵体态祟物造成真实伤害，无视减免", "判官笔：直接勾销一个祟物的阴籍"],
        "creed": "见鬼必啖。遇上不肯超度的怨灵，他比你还急。",
        "cost": 12,
        "side_effect": "阴气入体，理智 −1d6/1d10。",
    },
    {
        "id": "xuannv",
        "name": "九天玄女",
        "rank": "天师",
        "element": "火",
        "title": "兵法天女",
        "panel": {"武力": 60, "道法": 95, "神识": 100},
        "abilities": ["天书布阵：接下来三回合，全队检定 +25", "火焚邪祟：对全场造成 4d6 真火伤害"],
        "creed": "以智破局，最厌逞血气之勇。",
        "cost": 12,
        "side_effect": "神识过载：结束后记住的东西会忘掉一件（剧情级失忆）。",
    },
    {
        "id": "zhenwu",
        "name": "真武大帝",
        "rank": "天师",
        "element": "水",
        "title": "北方荡魔天尊",
        "panel": {"武力": 95, "道法": 90, "神识": 95},
        "abilities": ["荡魔：一击定胜负，伤害 6d8", "玄武护体：三回合内所受伤害减半"],
        "creed": "荡尽天下魔。代价往往由请神者自己付。",
        "cost": 14,
        "side_effect": "折寿。按请神回合数，每回合永久体质 −1。",
    },
]

SPIRIT_BY_ID = {s["id"]: s for s in SPIRITS}


def available(rank: str) -> list[dict]:
    """当前箓职能请到的英灵。"""
    if rank not in RANKS:
        rank = "初真"
    limit = RANKS.index(rank)
    return [s for s in SPIRITS if RANKS.index(s["rank"]) <= limit]


def get(spirit_id: str) -> dict | None:
    return SPIRIT_BY_ID.get(spirit_id)


def approval_cost(spirit: dict, approval: int) -> int:
    """认可度每 20 点减 10% 灵力消耗。"""
    base = int(spirit["cost"])
    return max(1, round(base * (1 - (approval // 20) * 0.10)))


def inherit_ratio(approval: int) -> float:
    """能力继承比例：认可度 0 时四成，满认可度时满值。"""
    return 0.4 + 0.6 * max(0, min(100, approval)) / 100.0
