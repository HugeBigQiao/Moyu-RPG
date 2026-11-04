"""五行生克。

设定来源：《玄门诡事录》——所有祟物、法术、符咒都带五行属性，
另有一个变种「煞」：不受任何一行克制，但也不克制任何一行。

相克：金克木，木克土，土克水，水克火，火克金
相生：金生水，水生木，木生火，火生土，土生金
"""

from __future__ import annotations

ELEMENTS = ("金", "木", "水", "火", "土")

# 我克谁
KE = {"金": "木", "木": "土", "土": "水", "水": "火", "火": "金"}

# 我生谁
SHENG = {"金": "水", "水": "木", "木": "火", "火": "土", "土": "金"}

SHA = "煞"

ELEMENT_INTRO = {
    "金": "锐、杀、兵刃。主决断，伤人伤己，过盛则肺燥而咳血。",
    "木": "生、养、草木。主仁，长于疗愈与缠缚，过盛则肝郁易怒。",
    "水": "流、藏、阴私。主智，长于渗透与遮蔽，过盛则肾寒畏冷。",
    "火": "炎、明、暴烈。主礼，长于焚灭与照破虚妄，过盛则心燥失眠。",
    "土": "厚、镇、承载。主信，长于结禁与防护，过盛则脾滞嗜睡。",
    "煞": "非五行之属，自人心怨憎中凝出。不循生克，故难克亦难被克。",
}

SEVERITY = {
    "克": "克制",
    "被克": "受制",
    "同源": "同源",
    "无涉": "无涉",
    "煞": "阴煞",
}


def is_sha(element: str | None) -> bool:
    return element == SHA


def relation(attacker: str | None, defender: str | None) -> str:
    """返回 克 / 被克 / 同源 / 无涉 / 煞。"""
    if is_sha(attacker):
        return "煞"
    if not attacker or not defender:
        return "无涉"
    if attacker == defender:
        return "同源"
    if KE.get(attacker) == defender:
        return "克"
    if KE.get(defender) == attacker:
        return "被克"
    return "无涉"


def multiplier(attacker: str | None, defender: str | None) -> float:
    """伤害倍率。克制 1.5，受制 0.5，阴煞 1.25。"""
    rel = relation(attacker, defender)
    if rel == "克":
        return 1.5
    if rel == "被克":
        return 0.5
    if rel == "煞":
        return 1.25
    return 1.0


def produces(attacker: str | None, defender: str | None) -> bool:
    """相生：攻击方的属性生出了对方的属性 —— 伤害被吸取。"""
    if not attacker or not defender or is_sha(attacker) or is_sha(defender):
        return False
    return SHENG.get(attacker) == defender


def check_modifier(attacker: str | None, defender: str | None) -> int:
    """属性对抗给检定带来的加值（百分点）。"""
    rel = relation(attacker, defender)
    return {"克": 20, "被克": -20, "同源": 5, "煞": 10}.get(rel, 0)


def describe(attacker: str | None, defender: str | None) -> str:
    rel = relation(attacker, defender)
    if rel == "克":
        return "%s克%s，伤害 ×1.5，检定 +20" % (attacker, defender)
    if rel == "被克":
        return "%s受%s所制，伤害 ×0.5，检定 −20" % (attacker, defender)
    if rel == "同源":
        return "%s同源，抵抗更强，检定仅 +5" % attacker
    if rel == "煞":
        return "阴煞之力不循生克，伤害 ×1.25，检定 +10"
    return "%s与%s无涉，一切照常" % (attacker, defender)
