# 摸鱼跑团 · 玄门诡事录

本地单人跑团系统。现代中国，祟物由人心淤积而成，你是玄真司来收尾的人。

界面分成两块：**背景档案**（查设定）和**开始游戏**（进地图跑团）。
数据库默认 SQLite，开箱即用；代码同时兼容 PostgreSQL / MySQL。

---

## 结构

```
frontend/     Vue 3 + Vite + vue-router（纯前端，只通过 /api 说话）
backend/      FastAPI + SQLAlchemy + Alembic
  app/        接口与规则引擎
  data/       SQLite 库文件（moyu.db，不进 git）
  migrations/ Alembic 迁移
  tests/      84 个单测
  scripts/    冒烟脚本、跨库迁移、地图生成
docs/         世界观设定档
start.bat     一键启动（Windows）
```

---

## 一键启动（Windows）

双击 **`start.bat`**。脚本按顺序做六件事，任何一步失败都会停下来告诉你原因：

1. 查工具链（uv / node，缺了给安装命令）
2. 查数据库 —— **SQLite 只确认文件位置**，PG 才检查端口与建库
3. `uv sync` 同步后端依赖
4. `alembic upgrade head` 应用迁移
5. 前端没有 `dist/` 就 `npm install && npm run build`
6. 启动服务，健康检查通过后开浏览器

重复启动是安全的：已经在跑就直接开浏览器；依赖装过、迁移最新都会跳过。
按 `Ctrl+C` 停止。

也可以直接跑脚本：

```powershell
.\start.ps1                 # 默认 8770
.\start.ps1 -Port 9000
.\start.ps1 -NoBrowser
.\start.ps1 -Rebuild        # 强制重建前端
```

---

## 数据库

默认 **SQLite**：`backend/data/moyu.db`，不用装任何东西。

```powershell
cd backend
uv sync
uv run alembic upgrade head        # 建表
```

要换成 PostgreSQL 或 MySQL，改 `backend/.env` 里一行就行，代码不用动：

```ini
# PostgreSQL
MOYU_DATABASE_URL=postgresql+asyncpg://postgres:123456@127.0.0.1:5432/moyu_trpg
# MySQL（另需 uv add asyncmy）
MOYU_DATABASE_URL=mysql+asyncmy://root:123456@127.0.0.1:3306/moyu_trpg
```

**搬数据**（三个方言互转，表结构先在新库 `alembic upgrade head`）：

```powershell
uv run python scripts/migrate_db.py --from postgresql+asyncpg://postgres:123456@127.0.0.1:5432/moyu_trpg
uv run python scripts/migrate_db.py --from auto --dry-run    # 只数行，不写
```

JSON 列用的是 `JSON().with_variant(JSONB, "postgresql")`：PG 上是 JSONB，
SQLite / MySQL 上就是 JSON，迁移和查询都不会因为方言挂掉。

---

## 界面

### 首页
顶栏一个细条：左边书名，右边设置。下面是两个大方块：**开始游戏** / **背景档案**。

### 设置
页面风格三套（深色控制台 / 浅色纸张 / 墨色）、字号四档、动效开关。存在 localStorage。

### 背景档案（11 个独立档案，左目录 → 中列表 → 右正文）
城市设定 · 人物设定 · 国家机构 · 教派 · 行业 · 国家 · 世界背景 ·
事件库 · 任务库 · 装备库 · 人物特性库

### 开始游戏（三栏 5 : 4 : 1）
- **左**：中国地图，10 座城按经纬度落点，点城市切换
- **中**：展示面板 —— 城市信息 + 当前势力 + 当前任务 + 随机任务样例 + 在册人物
- **右**：菜单栏（人物 / 任务 / 参与 / 城市），宽度只够放按钮，点开在中间展开

人物面板里可以就地生成人物、选中一个人作为「当前人物」；
任务面板里点「开团」就用当前人物开这一桩案子。

---

## 内容量

| 项 | 数量 |
| --- | --- |
| 城市（特级→四级） | 10 |
| 固定人物 | 8 |
| 国家 / 机构 / 教派 / 行业 | 3 / 4 / 6 / 16 |
| 事件（甲乙丙丁） | 50 |
| 特性（甲乙丙丁） | 20 |
| 装备 | 16 |
| 固定任务 | 5 + 无限随机任务 |

人物生成：`随机城市（按人口加权）→ 1~该城事件上限条事件 → 特性 → 稀有度`，
难度与报酬由事件等级与祟物体量算出来。城市等级越高，能长出越复杂的人。

---

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/world` | 国家/教派/机构/人物/行业/世界背景/城市（含经纬度与势力） |
| GET | `/api/events` `/api/missions` `/api/equipment` `/api/traits` | 四个档案 |
| GET | `/api/game/map` | 地图用：城市 + 坐标 + 人数 |
| GET | `/api/game/city/{id}` | 城市面板：信息/任务/势力/人物 |
| GET | `/api/roster` | 在册人物 |
| POST | `/api/npcs` `/api/characters` | 随机生成 / 玩家自建 |
| GET | `/api/characters/{id}` | 角色卡 |
| POST | `/api/characters/{id}/promote\|trial\|buy` | 授箓 / 试炼 / 商店 |
| POST | `/api/sessions` `/api/sessions/random` | 固定任务 / 随机任务开团 |
| POST | `/api/sessions/{id}/act` | 行动 |
| GET | `/api/docs` | OpenAPI |

---

## 验证

```powershell
cd backend
uv run pytest -q                    # 84
uv run python scripts/api_smoke.py  # 24（走 HTTP 全链路）

cd ../frontend
node scripts/ui_smoke.mjs           # 23（无头 Edge：首页/设置/档案/地图/菜单）
```

---

## 没做的

- 多人联机（局域网）没做，现在是单机单人。
- 任务只有 5 个固定剧本 + 随机生成，没有任务链/战役。
- 装备库还没接进战斗数值（现在只是数据 + 商店里那几件）。
- 地图是静态落点，没有边界、省份、路线。
