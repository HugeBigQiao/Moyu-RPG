#!/usr/bin/env bash
# 玄门诡事录 · Linux / macOS 启动器（Node/TS + cordis）
#
# 用法：
#   ./start.sh              启动（默认 8888，尝试打开浏览器）
#   ./start.sh --port 9000  换端口
#   ./start.sh --no-open    不开浏览器
#   ./start.sh --rebuild    强制重建前端
#
# 运行要求：Node >= 24（原生 TS 与 node:sqlite）。数据库默认 SQLite，
# 需要 PostgreSQL / MySQL 时改 MOYU_DATABASE_URL 即可，代码不用动。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
SERVER="$ROOT/server"
FRONTEND="$ROOT/frontend"

PORT="${MOYU_PORT:-8888}"
OPEN_BROWSER=1
REBUILD=0

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:?--port 需要一个端口号}"; shift 2 ;;
    --no-open) OPEN_BROWSER=0; shift ;;
    --rebuild) REBUILD=1; shift ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "未知参数：$1" >&2; exit 2 ;;
  esac
done

BASE_URL="http://127.0.0.1:$PORT"

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

[ -d "$SERVER" ] || fail "找不到 server 目录（请在项目根目录运行）"

if command -v curl >/dev/null 2>&1 && curl -fsS --max-time 2 "$BASE_URL/api/health" >/dev/null 2>&1; then
  ok "服务已经在 $BASE_URL 上跑着，直接打开。"
  open_url
  exit 0
fi

step 1/3 "检查工具链"
command -v node >/dev/null 2>&1 || fail "没找到 node（要求 Node >= 24：https://nodejs.org/）"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 24 ] || fail "Node 版本太低（当前 $(node -v)，要求 >= 24）"
command -v npm >/dev/null 2>&1 || fail "没找到 npm（随 Node 一起安装）"
ok "node $(node -v)"
ok "npm  $(npm -v)"

step 2/3 "准备后端依赖"
if [ ! -d "$SERVER/node_modules" ]; then
  ( cd "$SERVER" && npm install --no-fund --no-audit ) || fail "npm install 失败（检查网络）"
  ok "后端依赖已安装"
else
  ok "后端依赖已存在（重装：rm -rf server/node_modules 后重跑）"
fi

step 3/3 "检查前端产物"
if [ "$REBUILD" -eq 1 ] || [ ! -f "$FRONTEND/dist/index.html" ]; then
  ( cd "$FRONTEND" && { [ -d node_modules ] || npm install --no-fund --no-audit; } && npm run build ) \
    || fail "前端构建失败（手动：cd frontend && npm run build）"
  ok "前端构建完成"
else
  ok "已有 dist（强制重建：./start.sh --rebuild）"
fi

printf '\n  服务地址  %s\n' "$BASE_URL"
printf '  停止服务  Ctrl+C\n\n'
( sleep 2; open_url ) &

cd "$SERVER"
export MOYU_PORT="$PORT"
exec node src/index.ts
