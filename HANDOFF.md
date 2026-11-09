# 交接文档

> 这份文档记录项目是怎么长成现在这样的、当前状态、以及接下来该怎么接手。
> 只写结论和判断，不贴过程对话。

---

## 1. 这是什么

一个**本地单人跑团系统**：现代中国玄门背景，玩家扮演玄真司的人处理「祟物」。
界面是数据档案 + 地图，不是传统 VTT。

设计上有一条主线：**祟物由人心淤积而生，修行者不是英雄，是来收尾的人**。
这条主线决定了结局不是「赢/输」，而是「善了 / 了结 / 未了」。

---

## 2. 当前状态

| 项 | 状态 |
| --- | --- |
| 可运行 | 是。`start.bat` 双击即起，默认 http://127.0.0.1:8770 |
| 数据库 | 默认 SQLite（`backend/data/moyu.db`），兼容 PostgreSQL / MySQL |
| 内容 | 全部在 `backend/content/*.json`，改文件即改设定，支持热重载 |
| 测试 | 后端 101 个单测；接口冒烟 24 项；无头浏览器 UI 冒烟 23 项 |
| 前端 | Vue 3 + Vite，构建产物由后端托管 |

已经能完整玩一局：选城 → 开团（固定剧本或随机任务）→ 勘查/遭遇/抉择 → 结案 → 结算功德。

---

## 3. 是怎么走到这一步的（阶段汇总）

1. **规则引擎**：先把骰子、五行生克、d100 检定、资源公式写成纯函数，配单测。
   这一层不碰数据库、不碰 Web，所以后面换栈没有返工。
2. **Web 化**：FastAPI 出 JSON，前端先做了原生 HTML/JS 版本。
3. **前端换 Vue**：拆成 `frontend/`（Vue 3 + Vite + vue-router）与 `backend/` 两个大目录，
   后端只留 `/api/*`，页面路由交给 SPA。
4. **成长线**：授箓晋升（初真→盟威→五雷→天师）、心魔试炼、功德商店（含阴器与业障）。
5. **世界层**：国家 / 教派 / 机构 / 人物 / 行业 / 城市分级 / 事件 / 任务 / 装备 / 特性，
   城市等级决定「一个人最多能带几条出身事件」，人物由「城市 × 事件」生成。
6. **随机任务**：城市 + 事件现场拼场景流，任务编号里带种子，可复现。
7. **数据库迁移**：从 PostgreSQL 切到 SQLite 为主，模型改成方言无关的 JSON 列，
   并写了跨库搬运脚本；旧数据 295 行完整迁过来。
8. **内容数据化**：所有设定从 Python 常量搬进 JSON，模块只负责加载与索引。
9. **界面重构**：首页双卡（开始游戏 / 背景档案）、设置面板、11 个档案页、游戏三栏（地图 / 面板 / 菜单）。
10. **API 拆板块**：`app/api/` 按资源分 router，`main.py` 只负责建 app 与挂静态站。

---

## 4. 关键决策（以及为什么）

| 决策 | 理由 |
| --- | --- |
| 规则引擎纯函数、随机带种子 | 可回放、可复现、可单测；bug 能重放 |
| 内容放 JSON 而不是数据库 | 内容需要 diff、review、版本管理；数据库只放会变的状态 |
| 数据库默认 SQLite | 单机单人，零部署成本；保留 PG/MySQL 兼容给未来联机 |
| JSON 列用 `JSON().with_variant(JSONB, "postgresql")` | 三个方言都能跑，PG 上仍有 JSONB 性能 |
| 不用 ORM 存设定 | 设定是「随版本改动的内容」，不是运行期数据 |
| 前端不用 UI 框架 | 界面是「档案 + 地图」，手写 CSS 更可控，包也小 |
| 地图用 TopoJSON 离线生成 SVG | 不依赖在线地图服务，一次生成、永久离线 |

---

## 5. 目录导览

```
frontend/            Vue 3 + Vite
  src/views/         首页 / 档案 / 游戏 / 角色 / 建卡 / 处置台
  src/components/    顶栏 / 设置 / 地图 / 经验条 / 事件流
  src/assets/china.js 由脚本生成的中国轮廓（勿手改）
backend/
  app/api/           接口板块（archive / game / characters / sessions）
  app/engine/        纯函数规则：骰子、五行、检定、角色卡、KP、任务生成、会话
  app/content/       内容加载器（数据在 content/*.json）
  content/           ★ 全部设定数据
  data/              SQLite 库文件
  migrations/        Alembic
  tests/             101 个单测
  scripts/           冒烟、跨库搬运、地图生成、内容导出
docs/                世界观、架构、开发指南、接口
```

---

## 6. 接手第一件事

```powershell
.\start.bat                 # 起服务
cd backend;  uv run pytest -q
cd ../frontend; node scripts/ui_smoke.mjs
```

改设定：直接编辑 `backend/content/*.json`，然后

```powershell
curl -X POST http://127.0.0.1:8770/api/admin/reload
```

改规则：`backend/app/engine/`，改完跑单测。

---

## 7. 已知问题与技术债

1. **装备还没接进战斗**：装备库有数据、商店能买，但只有商店那几件的效果进了计算。
2. **地图是静态落点**：没有省界、路线、势力着色。
3. **认可度不会自然增长**：只有晋升时给初始值，做符合英灵道义的事不会涨。
4. **随机任务只有一种骨架**：勘查×2~3 → 遭遇 → 抉择，没有更复杂的结构。
5. **没有多人**：WebSocket 房间、权限、并发状态都没做。
6. **内容没有 schema 校验**：JSON 结构错了要到运行时报错（加载时会抛 ContentError）。
7. **前端包体积**：地图路径 + 视图全打进一个 chunk，约 159KB（gzip 58KB），还能再拆。

---

## 8. 下一步建议（按性价比）

1. **装备进战斗**：把 `equipment.json` 的 effect 接到 `engine/session.py` 的伤害与防御。
2. **内容 schema 校验**：给 `content/*.json` 写 Pydantic 模型，加载时校验，错误信息指到字段。
3. **任务链**：一桩案子接一桩，用「因果线」把几个固定剧本串起来。
4. **地图增强**：省界与势力着色，点击城市高亮势力范围。
5. **多人联机**：局域网房间 + WebSocket，把 `PlaySession` 的状态改成广播式。

---

## 9. 外部依赖与许可

- Python：FastAPI、SQLAlchemy、Alembic、aiosqlite、asyncpg、uvicorn、pydantic。
- 前端：Vue 3、vue-router、Vite、playwright-core（仅测试用）。
- 地图数据：world-atlas（Natural Earth 衍生的 1:110m TopoJSON），经脚本简化为 SVG 路径。
- 许可：MIT（见 LICENSE）。
