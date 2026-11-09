# 玄门诡事录

一个**本地单人跑团系统**。现代中国玄门背景，你扮演玄真司的人处理祟物——
不是来打赢的，是来收尾的。

界面分两块：**背景档案**（查设定）与**开始游戏**（中国地图上选城、生人、开团）。

---

## 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | Vue 3 + Vite + vue-router（无 UI 框架，手写 CSS） |
| 后端 | FastAPI + SQLAlchemy 2（异步）+ Alembic |
| 数据库 | SQLite（默认，零部署）；兼容 PostgreSQL / MySQL |
| 内容 | `backend/data/content/*.json`，改 JSON 即改设定，支持热重载 |
| 测试 | pytest（101）+ HTTP 冒烟（24）+ 无头 Edge UI 冒烟（23） |

---

## 快速开始

**Windows 一键**：双击 `start.bat`。脚本会检查工具链、准备数据库、装依赖、跑迁移、
按需构建前端、启动服务并打开浏览器。

**手动**：

```powershell
cd backend
uv sync
uv run alembic upgrade head

cd ../frontend
npm install
npm run build

cd ../backend
uv run python run.py          # http://127.0.0.1:8888
```

前端开发模式：后端 `uv run python run.py`，另开终端 `cd frontend && npm run dev`（5173，自动代理 `/api`）。

---

## 目录

```
frontend/   Vue 3 前端
backend/    FastAPI 后端（app/api 接口、app/engine 规则、app/models 持久层、data/ 数据板块）
docs/       文档
start.bat   一键启动
```

---

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/世界观.md](docs/世界观.md) | 背景设定：国家、教派、机构、人物、城市、事件、任务、数值 |
| [docs/架构.md](docs/架构.md) | 分层、内容加载、数据库、接口板块、技术选型评估 |
| [docs/开发指南.md](docs/开发指南.md) | 怎么跑、怎么改内容、怎么加接口、怎么写测试 |
| [docs/接口.md](docs/接口.md) | API 一览 |
| [HANDOFF.json](HANDOFF.json) | 交接档（JSON）：项目历程、关键决策、踩坑、已知问题、下一步 |

---

## 许可

MIT，见 [LICENSE](LICENSE)。
