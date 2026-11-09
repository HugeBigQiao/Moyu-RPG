"""FastAPI 入口。

职责：
    建应用、挂 API 板块、挂前端构建产物，顺带给出 uvicorn 启动函数。
为什么需要：
    业务接口必须有个统一装配点；这里只做装配，不写业务。
上下游：
    上游：app/api、app/models；下游：uvicorn（app.main:app）。
"""


from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .api import api_router
from .config import FRONTEND_DIST, settings
from .models import init_models

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
