"""FastAPI 入口。

只做三件事：建 app、挂 API 板块、挂前端产物。
接口在 app/api/，设定在 content/*.json，规则在 app/engine/。
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .api import api_router
from .config import FRONTEND_DIST, settings
from .db import init_models

PLATFORM = "玄武 · 边缘节点运控台"
DIST = FRONTEND_DIST


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.auto_create_tables:
        await init_models()
    yield


app = FastAPI(
    title=PLATFORM,
    description="本地跑团服务：档案、人物、任务与会话。",
    lifespan=lifespan,
    docs_url="/api/docs",
)
app.include_router(api_router)


# ---------------------------------------------------------------- 前端产物

if (DIST / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=str(DIST / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse({"detail": "接口不存在"}, status_code=404)
        target = DIST / full_path
        if full_path and target.is_file():
            return FileResponse(target)
        return FileResponse(DIST / "index.html")

else:
    @app.get("/", include_in_schema=False)
    async def not_built():
        return JSONResponse(
            {"detail": "前端还没构建：cd frontend && npm install && npm run build"},
            status_code=503,
        )


def run() -> None:
    import uvicorn

    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=False)
