"""请求体模型。

放在一处，方便对照前端 api.js。
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
