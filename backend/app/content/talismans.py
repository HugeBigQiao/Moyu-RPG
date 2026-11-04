"""符箓库。

符箓派的核心资产：每张符有「绘制成本」（每日灵力预算）和「引动成本」
（战斗中用出去的那一下）。设定里绘制贵、引动便宜，所以真正的策略是
开打之前画什么、带几张。
"""

from __future__ import annotations

TALISMANS = [
    {
        "id": "binghuo",
        "name": "丙火破邪符",
        "element": "火",
        "draw_cost": 3,
        "use_cost": 1,
        "kind": "damage",
        "damage": "2d6",
        "scale": "wil",
        "note": "对水属祟物额外 ×1.5；可能引燃木质环境",
    },
    {
        "id": "gengjin",
        "name": "庚金斩煞符",
        "element": "金",
        "draw_cost": 4,
        "use_cost": 4,
        "kind": "damage",
        "damage": "3d6",
        "scale": "wil",
        "note": "直线贯穿，可斩断附身丝线",
    },
    {
        "id": "lihuo",
        "name": "离火符",
        "element": "火",
        "draw_cost": 2,
        "use_cost": 1,
        "kind": "damage",
        "damage": "2d6",
        "scale": "wil",
        "note": "最常用的攻符，性价比高",
    },
    {
        "id": "xunfeng",
        "name": "巽风符",
        "element": "木",
        "draw_cost": 2,
        "use_cost": 1,
        "kind": "damage",
        "damage": "1d6",
        "scale": "wil",
        "note": "单体伤害偏低，但与离火符同贴可成「火龙卷」",
    },
    {
        "id": "zhenlei",
        "name": "五雷正符",
        "element": "木",
        "draw_cost": 5,
        "use_cost": 3,
        "kind": "damage",
        "damage": "3d8",
        "scale": "wil",
        "note": "震为雷，属木。金属环境中易引发二次雷击",
    },
    {
        "id": "wutu",
        "name": "戊土镇地符",
        "element": "土",
        "draw_cost": 2,
        "use_cost": 2,
        "kind": "ward",
        "damage": None,
        "scale": None,
        "note": "半径三米结界，抵挡低阶祟物入内，持续 3 回合",
    },
    {
        "id": "sixiang",
        "name": "四象结界符",
        "element": "土",
        "draw_cost": 4,
        "use_cost": 3,
        "kind": "ward",
        "damage": None,
        "scale": None,
        "note": "封住一整层的附身扩散，需提前布置",
    },
    {
        "id": "taiyin",
        "name": "太阴安神符",
        "element": "水",
        "draw_cost": 4,
        "use_cost": 4,
        "kind": "calm",
        "damage": None,
        "scale": None,
        "note": "安抚被附体者，配合话术可消除一级疯狂",
    },
    {
        "id": "guishui",
        "name": "癸水净秽符",
        "element": "水",
        "draw_cost": 2,
        "use_cost": 2,
        "kind": "reveal",
        "damage": None,
        "scale": None,
        "note": "净化一片阴浊，使隐形的灵体态祟物显形",
    },
    {
        "id": "zhixue",
        "name": "止血符",
        "element": "木",
        "draw_cost": 2,
        "use_cost": 2,
        "kind": "heal",
        "damage": "2d6",
        "scale": "wil",
        "note": "生肌止血，对「阴性创伤」只回一半",
    },
    {
        "id": "dingshen",
        "name": "定身符",
        "element": "土",
        "draw_cost": 3,
        "use_cost": 2,
        "kind": "control",
        "damage": None,
        "scale": None,
        "note": "贴中则祟物一回合不能动，对实体化目标才有效",
    },
]

TALISMAN_BY_ID = {t["id"]: t for t in TALISMANS}


def get(talisman_id: str) -> dict | None:
    return TALISMAN_BY_ID.get(talisman_id)
