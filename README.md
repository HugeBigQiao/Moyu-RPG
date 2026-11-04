# 摸鱼跑团 · 玄门诡事录

本地单人跑团系统，界面伪装成一台**边缘节点运控台**。
你在工位上看的是「总览」「人员档案」「事件处置」，实际在跑团。

设定：现代中国，祟物由人心淤积而成，玄真司负责把它们了结。

---

## 结构

前后两个大目录，互不越界：

```
frontend/     Vue 3 + Vite + vue-router，纯前端，只通过 /api 说话
backend/      FastAPI + SQLAlchemy + PostgreSQL + Alembic，只提供 JSON
docs/         世界观设定档（可改）
```

`backend/` 自己是一个完整的 Python 项目（pyproject / alembic / tests / scripts 都在里面）。

---

## 快速开始

```powershell
# 0. 数据库（本机 PG，口令 123456）
$env:PGPASSWORD='123456'
& 'D:\Postgres\bin\psql.exe' -h 127.0.0.1 -U postgres -d postgres -c "create database moyu_trpg encoding 'UTF8';"

# 1. 后端
cd backend
uv sync
uv run alembic upgrade head

# 2. 前端
cd ../frontend
npm install
npm run build

# 3. 起服务
cd ../backend
uv run python run.py          # http://127.0.0.1:8770
```

开发模式：

```powershell
cd backend;  uv run python run.py        # 后端 8770
cd frontend; npm run dev                 # 前端 5173，/api 自动代理
```

验证：

```powershell
cd backend
uv run pytest -q                      # 67 个单测（规则 + 世界 + 人物生成）
uv run python scripts/smoke.py mirror # 不开服务器，自动打一局
uv run python scripts/api_smoke.py    # 走 HTTP 全链路（24 项）

cd ../frontend
node scripts/ui_smoke.mjs             # 无头 Edge 跑真实页面（21 项）
```

---

## 它现在是什么

### 世界层（`backend/app/content/world.py`）

- **国家** 3 个：夏（主舞台）、北岭、东海
- **教派** 6 个：正一、全真、茅山、闾山、青城、白云教
- **机构** 4 个：玄真司（玩家的单位）、天监司、靖安司、礼制院
- **人物** 8 位：司主、评级官、掌门、教主、刑警、记者、散修、城投董事长
- **行业** 16 个：地产不特殊，只是规模大占的坑多
- **城市** 10 座，分五级：特级 / 一级 / 二级 / 三级 / 四级

### 事件与特性（`events.py` / `traits.py`）

- 事件 24 条，分**甲/乙/丙/丁**四级
- 规则：等级越高越稀罕、越少被通用 —— 甲级只挂在特定任务上，丁级哪里都能长
- 每条事件带 1–2 个特性（特性同样分四级）和一个「钩子」

### 人物生成（`engine/npc.py`）

| | 玩家自建 | 系统随机 |
| --- | --- | --- |
| 属性 | 点数分配，总分 72，单项 6–18 | 4d6↓ + 城市等级加成 |
| 出身 | 自选城市与流派 | 按人口加权随机城市 |
| 事件 | 选最多 3 条通用事件 | 1 ~ 城市事件上限条（特级最多 10） |
| 稀有度 | 凡品起 | 由最高事件等级决定 |

**难度与报酬**从出身事件推：`难度 = Σ(5−等级)×2 + 祟物体量/10 + 城市修正`，`报酬 = 难度×3`。

### 跑团本体

五行生克、三态祟物、符箓两笔账（制符预算 vs 战斗灵力）、授箓四级 + 心魔试炼、
功德商店（含阴器与业障）、KP 每轮掷事件表。五个剧本：镜中鬼 / 写字楼血案 / 旱骨 / 送纸 / 夜航。

---

## 目录

```
frontend/
  src/views/         Dashboard / Roster / Create / Character / Play / World / Events / Scenarios
  src/components/    SideNav / TopBar / MeterBar / EventStream
  src/api.js         /api 薄封装
  scripts/ui_smoke.mjs

backend/
  app/main.py        JSON 接口 + 挂载前端产物
  app/models.py      characters / sessions / session_logs
  app/engine/        dice · wuxing · checks · sheet · gacha · npc · kp · progress · session
  app/content/       world · events · traits · missions · talismans · spirits · bestiary · shop · scenario
  migrations/        Alembic（四个版本）
  tests/             67 个单测
  scripts/           smoke.py · api_smoke.py

docs/世界观.md       设定档
```

---

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/dashboard` | 总览 |
| GET | `/api/world` | 国家/教派/机构/人物/行业/城市 |
| GET | `/api/events` | 事件库 |
| GET | `/api/missions` | 任务与城市 |
| GET | `/api/roster` | 人员档案 |
| POST | `/api/npcs` | 随机生成人物 `{count, city}` |
| POST | `/api/characters` | 玩家自建 `{name, school, element, city, attrs, events}` |
| GET | `/api/characters/{id}` | 角色卡 |
| POST | `/api/characters/{id}/promote` \| `/trial` \| `/buy` | 成长线 |
| POST | `/api/sessions` | 开团 `{character_id, scenario_id}` |
| GET/POST | `/api/sessions/{id}` \| `/act` | 取状态 / 执行操作 |
| GET | `/api/docs` | OpenAPI |

---

## 没做的

- **随机任务只算出了一半**：难度和报酬已经从事件推出来了，但「从事件拼出一整场剧本」还没做。
- 多人在线（局域网联机）没做，现在是单机单人。
- 认可度还不能靠「做符合英灵道义的事」慢慢涨。
