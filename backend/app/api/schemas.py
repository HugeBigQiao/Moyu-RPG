"""请求体模型。

职责：
    定义前端 POST 进来的 JSON 结构，做最基本的字段与范围校验。
为什么需要：
    接口层不该手搓 dict；集中在这里也方便和前端 api.js 对照。
上下游：
    上游：前端请求；下游：app/api/* 的路由函数。
"""


from __future__ import annotations

from pydantic import BaseModel, Field


class GachaIn(BaseModel):
    count: int = 1


class BuyIn(BaseModel):
    item_id: str


class SessionIn(BaseModel):
    character_id: int
    scenario_id: str


class ActIn(BaseModel):
    action: str


class NpcIn(BaseModel):
    count: int = Field(1, ge=1, le=10)
    city: str | None = None
    mission: str | None = None


class PlayerIn(BaseModel):
    name: str
    school: str
    element: str
    city: str = "nanyu"
    attrs: dict[str, int] = {}
    events: list[str] = []
    notes: str = ""


class RandomSessionIn(BaseModel):
    character_id: int
    city: str | None = None
