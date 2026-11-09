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
#
# 缓存策略（踩过坑）：
#   index.html 必须 no-store —— 它引用的是带 hash 的 JS/CSS，一旦被浏览器缓存，
#   重新构建后仍会加载旧 bundle，表现为「改了没生效」。
#   /assets/* 文件名带 hash，可以放心长缓存。

NO_STORE = {"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"}


class LongCacheStatic(StaticFiles):
    """静态资源：文件名带 hash，允许浏览器永久缓存。

    注意：Starlette 的 file_response 是**同步**方法（返回 Response），
    写成 async 会返回协程对象，导致 500（踩过）。
    """

    def file_response(self, full_path, stat_result, scope, status_code=200):
        response = super().file_response(full_path, stat_result, scope, status_code)
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response


if (DIST / "index.html").exists():
    app.mount("/assets", LongCacheStatic(directory=str(DIST / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse({"detail": "接口不存在"}, status_code=404)
        target = DIST / full_path
        if full_path and target.is_file():
            return FileResponse(target, headers=NO_STORE)
        return FileResponse(DIST / "index.html", headers=NO_STORE)

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
