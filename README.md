# 玄门诡事录

一个**本地单人跑团系统**。现代中国玄门背景，你扮演玄真司的人处理祟物——
不是来打赢的，是来收尾的。

界面分两块：**背景档案**（查设定；11 类设定都能在页面上直接增删改，写回 JSON）与
**开始游戏**（中国地图上选城、生人、开团）。

---

## 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | Vue 3 + Vite + vue-router + TypeScript（vue-tsc 查类型；无 UI 框架，手写 CSS） |
| 后端 | Node 24+ / TypeScript / [cordis](https://github.com/cordiverse/cordis) 插件内核（`server/`） |
| 数据库 | SQLite 默认（Node 内置 `node:sqlite`，零部署）；`MOYU_DATABASE_URL` 可切 PostgreSQL / MySQL |
| 内容 | `server/data/content/*.json`，改 JSON 即改设定，支持热重载 |
| 测试 | vitest（268）+ HTTP 冒烟（28）+ 无头 Edge UI 冒烟（52）+ vue-tsc 类型检查 |

> Node 24+ 是硬要求：用到原生 TS 执行与 `node:sqlite`。
> 旧 Python 实现已删除；迁移过程与取舍见 [docs/cordis迁移.md](docs/cordis迁移.md)。

---

## 快速开始

**Windows 一键**：双击 `start.bat`。脚本会检查 Node、装后端依赖、按需构建前端、
启动服务并打开浏览器。

**Linux / macOS 一键**：

```bash
chmod +x start.sh     # 只需一次：在 Windows 上提交的文件没有可执行位
./start.sh            # 或 bash start.sh；支持 --port 9000 / --no-open / --rebuild
```

**手动**：

```bash
cd server
npm install
npm start             # http://127.0.0.1:8888
```

前端产物没有提交，首次运行会由一键脚本构建；手动构建：

```bash
cd frontend
npm install
npm run build
```

- 类型检查：`cd frontend && npm run typecheck`；后端：`cd server && npm run typecheck`。
- 前端开发模式：后端 `cd server && npm run dev`，另开终端 `cd frontend && npm run dev`
  （5173，自动代理 `/api` 到 8888）。
- 换数据库：`MOYU_DATABASE_URL=postgresql://user:pass@host:5432/moyu`（MySQL 同理），
  表结构会在首次启动时自动建好。SQLite 是默认，也是唯一在 CI 里跑过的路径。

---

## 目录

```
frontend/   Vue 3 前端
server/     Node/TS 后端（cordis 服务 + 全部内容数据）
docs/       文档
start.bat   一键启动
```

---

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/世界观.md](docs/世界观.md) | 背景设定：国家、教派、机构、人物、城市、事件、任务、数值 |
| [docs/架构.md](docs/架构.md) | 分层、cordis 服务、内容加载、数据库、接口板块、静态缓存 |
| [docs/开发指南.md](docs/开发指南.md) | 怎么跑、怎么改内容、怎么加接口、怎么写测试 |
| [docs/接口.md](docs/接口.md) | API 一览 |
| [docs/cordis迁移.md](docs/cordis迁移.md) | 从 FastAPI 迁到 cordis 的评估、目标架构、分阶段记录与风险 |
| [HANDOFF.json](HANDOFF.json) | 交接档（JSON）：项目历程、关键决策、踩坑、已知问题、下一步 |

---

## 许可

MIT，见 [LICENSE](LICENSE)。
