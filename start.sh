#!/usr/bin/env bash
# 玄门诡事录 · Linux / macOS 启动器
#
# 用法：
#   ./start.sh              启动（默认 8888，尝试打开浏览器）
#   ./start.sh --port 9000  换端口
#   ./start.sh --no-open    不开浏览器
#
# 和 Windows 的 start.ps1 做同样的事，只是省掉了 PostgreSQL 服务的检查：
# 默认 SQLite 不需要外部服务；换 PG 时请自己保证它在跑。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

# 端口优先级：命令行 > 环境变量 MOYU_PORT > backend/.env > 8888
PORT="${MOYU_PORT:-}"
if [ -z "$PORT" ] && [ -f "$BACKEND/.env" ]; then
  PORT="$(sed -n 's/^MOYU_PORT=//p' "$BACKEND/.env" | tail -n 1 | tr -d '\r')"
fi
PORT="${PORT:-8888}"
OPEN_BROWSER=1

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:?--port 需要一个端口号}"; shift 2 ;;
    --no-open) OPEN_BROWSER=0; shift ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "未知参数：$1" >&2; exit 2 ;;
  esac
done

BASE_URL="http://127.0.0.1:$PORT"

# ---------------------------------------------------------------- 输出
step() { printf '\n\033[36m  [%s] %s\033[0m\n' "$1" "$2"; }
ok()   { printf '        \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '        \033[33m!\033[0m %s\n' "$1"; }
fail() { printf '\n  \033[31m× %s\033[0m\n' "$1" >&2; exit 1; }

open_url() {
  [ "$OPEN_BROWSER" -eq 1 ] || return 0
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$BASE_URL" >/dev/null 2>&1 || true
  elif command -v open >/dev/null 2>&1; then
    open "$BASE_URL" >/dev/null 2>&1 || true
  fi
}

echo
echo "  玄门诡事录 · 本地跑团服务"
echo "  XUANWU OPS · $ROOT"

[ -d "$BACKEND" ] || fail "找不到 backend 目录（请在项目根目录运行）"

# ---------------------------------------------------------------- 0. 已在运行？
if command -v curl >/dev/null 2>&1 && curl -fsS --max-time 2 "$BASE_URL/api/dashboard" >/dev/null 2>&1; then
  ok "服务已经在 $BASE_URL 上跑着，直接打开。"
  open_url
  exit 0
fi

# ---------------------------------------------------------------- 1. 工具链
step 1/4 "检查工具链"
command -v uv >/dev/null 2>&1 || fail "没找到 uv（安装：curl -LsSf https://astral.sh/uv/install.sh | sh）"
ok "uv $(uv --version)"
if command -v node >/dev/null 2>&1; then
  ok "node $(node --version)"
else
  warn "没找到 node —— 前端只能复用已有 dist"
fi

# ---------------------------------------------------------------- 2. 后端依赖
step 2/4 "同步后端依赖"
( cd "$BACKEND" && uv sync --quiet ) || fail "uv sync 失败（检查网络，或看 pyproject 里的镜像源）"
ok "依赖就绪"

# ---------------------------------------------------------------- 3. 数据库迁移
step 3/4 "应用数据库迁移"
( cd "$BACKEND" && uv run alembic upgrade head >/dev/null ) \
  || fail "迁移失败（手动排查：cd backend && uv run alembic upgrade head）"
ok "结构已是最新"

# ---------------------------------------------------------------- 4. 前端产物
step 4/4 "检查前端构建"
if [ ! -f "$FRONTEND/dist/index.html" ]; then
  command -v npm >/dev/null 2>&1 || fail "需要构建前端，但没找到 npm"
  ( cd "$FRONTEND" && { [ -d node_modules ] || npm install --no-fund --no-audit; } && npm run build ) \
    || fail "前端构建失败（手动：cd frontend && npm run build）"
  ok "构建完成"
else
  ok "已有 dist（强制重建：rm -rf frontend/dist 后再跑）"
fi

# ---------------------------------------------------------------- 启动
printf '\n  服务地址  %s\n' "$BASE_URL"
printf '  接口文档  %s/api/docs\n' "$BASE_URL"
printf '  停止服务  Ctrl+C\n\n'

# 后台等两秒再开浏览器，避免打开时服务还没监听
( sleep 2; open_url ) &

cd "$BACKEND"
exec uv run uvicorn app.main:app --host 127.0.0.1 --port "$PORT" --log-level info
