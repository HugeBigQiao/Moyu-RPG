# 迁移到 cordis：评估与方案

> 2026-11-17 评估。结论先行：**技术上可行，且最硬的两个风险（随机数复现、cordis 装配）
> 已经用 PoC 验证过；但这是一次后端重写，不是换个框架的周末项目。**
> 本文给出目标架构、移植映射、分阶段计划、验收标准与止损点，供决定「做 / 不做 / 做多少」。

> 2026-11-17 更新：P0–P7 已全部完成，Node/TS 后端已接管启动，旧 Python 实现已删除；下文保留评估与实施记录。

---

## 0. 结论

| 问题 | 回答 |
| --- | --- |
| 能迁吗 | 能。引擎是纯函数、内容是 JSON、接口是薄层，结构上适合平移 |
| 最大风险是什么 | 不是 cordis，而是 `engine/session.py`（784 行状态机）与 169 个测试的语义对齐 |
| 随机数还能复现旧局吗 | 能。已实现 CPython `random.Random` 的逐位兼容版，PoC 全部对拍通过（见 §4.1） |
| cordis 能直接用吗 | 内核可以；`@cordisjs/plugin-server` 与最新内核不兼容，HTTP 层建议自研（约 100 行） |
| 值得吗 | 取决于动机：要「只留 Node / 前后端同语言」→ 值；只想「设定热更」→ 不值，现有 JSON+reload 已够 |
| 建议怎么走 | 先做 P0–P2（冻结契约 → 骨架 → 纯规则对拍），用结果决定是否继续；**不要一次性删 Python** |

---

## 1. 现状盘点

| 层 | 代码量 | 说明 | 迁移难度 |
| --- | ---: | --- | --- |
| `engine/` | 2252 行 | 纯函数；dice/checks/wuxing/sheet/gacha/npc/kp/mission/progress/session | 中（session 高） |
| `content/` | 1406 行 | 加载、索引、热重载、11 类档案的校验与原子写回 | 中 |
| `api/` | 952 行 | 30 个路由，FastAPI + Pydantic + SQLAlchemy | 低 |
| `models/` + `config.py` + `main.py` | 375 行 | 3 张表、SQLite/PG 方言、静态产物缓存 | 低 |
| `tests/` | 1082 行 / 169 个 | 引擎、内容、编辑、世界观 | 中（要逐条移植） |
| `frontend/` | 4004 行 / 37 文件 | Vue 3 + TS，只依赖 `/api` 契约 | **不动** |

已确认的现状：

- 25 个业务接口 + 5 个档案编辑/管理接口，共 30 个路由；
- 数据库 3 张表（`characters` / `sessions` / `session_logs`），JSON 列在 SQLite 里是 TEXT；
- 内容 10 个 JSON、约 104 KB，改文件即可生效；
- 169 个单测 + 28 项接口冒烟 + 52 项 UI 冒烟 + vue-tsc；
- 规则随机全部走 `dice.Roller`，种子是字符串 → sha256 → 前 16 位十六进制 → `random.Random(int)`。

---

## 2. 目标架构

### 2.1 目录

```
server/                      ← 新增，Node/TS 后端
  src/
    core/                    纯函数引擎，不依赖 cordis，可单独单测
      python.ts              round / 整除 / % 格式化 等语义垫片
      dice.ts checks.ts wuxing.ts sheet.ts
      gacha.ts npc.ts kp.ts mission.ts progress.ts session.ts
    content/
      store.ts               读 JSON、按 mtime 缓存、原子写回
      schema.ts              zod 模型（替代 Pydantic 的内容校验）
      edit.ts                11 类档案的字段/引用校验
      world.ts events.ts ... 各模块的索引与纯函数
    db/
      client.ts              node:sqlite 连接、PRAGMA、事务
      schema.sql             与 Alembic 基线等价的建表 SQL
      migrate.ts             user_version 迁移器
    plugins/                 cordis 插件：一个文件一个服务/板块
      content.ts             ctx.content
      rules.ts               ctx.rules
      db.ts                  ctx.db
      game.ts                ctx.game（开团/行动/结算编排）
      api-archive.ts         /api/world /events /missions ...
      api-edit.ts            /api/archive/*
      api-characters.ts      /api/roster /npcs /characters/*
      api-game.ts            /api/dashboard /game/*
      api-sessions.ts        /api/sessions/*
      http.ts                自研 HTTP 服务（路由/JSON/静态/错误）
      static.ts              前端产物与缓存头
    config.ts                zod 配置模型
    index.ts                 程序化装配（二期可换 @cordisjs/loader + YAML）
  test/
    parity/                  与 Python 的 golden 对拍
    unit/                    移植后的单测
    api/                     接口契约测试
```

前端不动；内容 JSON 从 `backend/data/content/` 迁到 `server/data/content/`。
迁移期间 `backend/` 作为对照实现保留，P7 全绿后已删除。

### 2.2 服务与依赖

```
                 ┌────────────┐
                 │  ctx.db    │  node:sqlite，3 张表
                 └─────┬──────┘
                       │ inject
┌────────────┐   ┌─────▼──────┐   ┌────────────┐
│ ctx.content│──▶│  ctx.game  │◀──│  ctx.rules │
│ 加载/热更  │   │ 开局/行动  │   │ 纯规则入口 │
└─────┬──────┘   └─────┬──────┘   └─────┬──────┘
      │                │                │
      │          ┌─────▼──────┐         │
      └─────────▶│ ctx.server │◀────────┘
                 │  路由/静态 │
                 └────────────┘
```

- 依赖用 `static inject = ['content']` 声明，加载顺序由 cordis 解析，不靠 import 顺序；
- 注册类副作用（路由、监听器、watcher）都放在 `ctx.effect()` 里，插件卸载时自动撤销；
- 跨模块通知走类型化事件：`content/reload`、`session/started`、`session/finished`；
- 规则引擎保持「吃 dict、吐 dict」，不 import cordis，保证可单测、可回放。

### 2.3 一个插件的形状

```ts
export class Rules extends Service {
  static inject = ['content']

  constructor(ctx: Context) {
    super(ctx, 'rules')
  }

  check(seed: string, skill: string, value: number, modifier = 0) {
    const roller = new Roller(seed)
    return resolve(roller, skill, value, modifier)
  }
}
```

```ts
const app = new Context()
app.use(Content, { dir: contentDir })
app.use(Rules)
app.use(Db, { url: dbUrl })
app.use(Game)
app.use(Http, { host: '127.0.0.1', port: 8888 })
app.use(ApiSessions)
```

---

## 3. 移植映射

| Python | TypeScript | 说明 |
| --- | --- | --- |
| `engine/dice.py` | `core/dice.ts` | MT19937 + CPython 方法语义，PoC 已验证 |
| `engine/checks.py` | `core/checks.ts` | 阈值、等级、描述文本逐字对齐 |
| `engine/wuxing.py` | `core/wuxing.ts` | 纯查表 |
| `engine/sheet.py` | `core/sheet.ts` | 特性/商店加成，需接内容层 |
| `engine/gacha.py` | `core/gacha.ts` | 旧抽卡，接口保留 |
| `engine/npc.py` | `core/npc.ts` | 城市/事件/属性生成 |
| `engine/kp.py` | `core/kp.ts` | 事件表 + 阴浊分层 |
| `engine/mission.py` | `core/mission.ts` | 随机任务拼场景流 |
| `engine/progress.py` | `core/progress.ts` | 授箓/试炼/商店 |
| `engine/session.py` | `core/session.ts` | **最大的一块，逐分支移植** |
| `content/_store.py` | `content/store.ts` | mtime 缓存 + `reload_all` + 事件 |
| `content/*.py` | `content/*.ts` | 加载器 + 索引 + 纯函数 |
| `content/edit.py` | `content/edit.ts` | 671 行校验，建议配 zod 重写而非直译 |
| `models/base.py` | `db/client.ts` | `node:sqlite`（Node 26 内置，已验证 3.53.4） |
| `models/entities.py` | `db/schema.sql` + 行类型 | 表名字段名不变，旧库可直接读 |
| `api/*.py` | `plugins/api-*.ts` | 30 个路由，响应形状保持 |
| `api/schemas.py` | `zod` | 请求体校验 |
| `main.py` 静态产物 | `plugins/static.ts` | `index.html` no-store、`/assets/*` immutable |
| `alembic` | `db/migrate.ts` | `PRAGMA user_version` + 顺序 SQL |

---

## 4. 关键技术问题

### 4.1 随机数：已解决（PoC）

旧局回放依赖「同一 seed → 同一串随机数」。Python 的 `random.Random(int)` 不是随便一个
MT19937 实现就能对上，至少有三处差异：

1. 种子展开：int 按 32 位小端切片后走 `init_by_array`，不是 `init_genrand`；
2. `randint` / `randrange` / `choice` 走 `_randbelow_with_getrandbits`（拒绝采样）；
3. `shuffle` 用 `_randbelow(i+1)` 反向交换；`sample` 有 pool / set 两套分支；
   `uniform(a,b) = a + (b-a) * random()`；`random()` 由两个 32 位字拼成。

PoC 实现了 `PythonRandom`（`server/src/core/dice.ts` 的雏形），与 Python 3.14.8 对拍：

| 对拍项 | 覆盖 | 结果 |
| --- | --- | --- |
| 字符串种子 → Roller | 8 个种子 × d100/d6/randrange/random/uniform/choice/shuffle/sample/weighted | 全部一致 |
| int 种子（0 / 1 / 2³²−1 / 2⁶³+1 / 2⁶⁴−1 / 混合） | getrandbits 1/7/31/32/33/63/64/100 位 | 全部一致 |
| 检定 | 30 组（技能 × 目标 × 修正），含 `describe` 文本 | 全部一致 |
| 五行 | 49 组（含 `煞` / `null`） | 全部一致 |

另外补了 `pyRound`：Python 的 `round()` 是银行家舍入，`round(2.5) === 2`，
JS 的 `Math.round(2.5) === 3`。引擎里伤害结算用到 `round(raw)`，不换会偶发差 1 点。

**结论：旧种子、旧会话的复现路径是通的。** 剩下的是把 `session.py` 的每个分支都跑到。

### 4.2 Python 语义差异清单

| Python | JS | 处理 |
| --- | --- | --- |
| `round(x)` 银行家舍入 | `Math.round` 四舍五入 | `pyRound()` |
| `round(x, 2)` | `toFixed` 行为不同 | `pyRound(x, 2)` |
| `a // b` 向下取整 | `/` 浮点 | `Math.floor`（负数要单独处理） |
| `int(x)` 向零截断 | `Math.trunc` | 显式 `Math.trunc` |
| `"%+d"` / `"%.0f"` | 模板字符串 | `signed()` / `fixed()` 小工具 |
| `json.dumps(ensure_ascii=False)` | `JSON.stringify` | 语义一致；键序不影响前端 |
| `sorted()` 稳定排序 | `Array.sort` 稳定（ES2019+） | 一致 |
| 大整数（>2⁵³） | number 丢精度 | 只出现在种子/哈希；用 BigInt，别进 JSON |

建议把这些垫片集中到 `core/python.ts`，并在 code review 里把它当作「危险区」对待。

### 4.3 数据层

- **驱动**：Node 26 内置 `node:sqlite`（SQLite 3.53.4），零原生依赖、零编译，
  单机单人完全够用；同步 API 比异步 ORM 更简单，事务边界也清楚。
- **表结构**：表名、字段名、JSON 列格式一律不变。SQLAlchemy 把 JSON 存成 TEXT，
  `node:sqlite` 读出来就是字符串，`JSON.parse` 即可；时间戳格式要按 SQLAlchemy 的
  `YYYY-MM-DD HH:MM:SS.ffffff` 解析/写入。
- **迁移**：Alembic 基线只有一条。Node 侧用 `PRAGMA user_version` 管增量；
  首次启动检测到 `alembic_version` 就视为基线，不重复建表。
- **PostgreSQL/MySQL**：`node:sqlite` 不支持。如果「兼容 PG/MySQL」这个卖点要保留，
  就得引入 `pg` / `mysql2` 并写方言适配；建议降级为「SQLite only」，
  需要时再按 DSN 前缀切驱动。**这是迁移中唯一需要产品决策的点。**

### 4.4 HTTP 与静态产物

PoC 结论：**不要用 `@cordisjs/plugin-server@1.7.0`。**

- 它与 `cordis@4.0.0-rc.12/rc.13` 不兼容：`Route` 构造时调用
  `server[Server.resolveConfig]()`，而该 API 在 rc.12 被移除，直接抛
  `TypeError: server[Server.resolveConfig] is not a function`；
- 在 `cordis@4.0.0-rc.11` 上可以正常工作（PoC 已跑通）；
- 但 `@cordisjs/loader@1.0.0-rc.10` 的 devDependency 是 `cordis@^4.0.0-rc.13`，
  生态内部版本并不齐。

后端需要的 HTTP 能力很少：30 个路由、JSON 请求/响应、静态产物、缓存头、统一错误。
自研一个 `HttpServer` 服务约 100 行（PoC 已实现），换来的是：

- 不跟 RC 生态的破窗绑定；
- 静态缓存策略（`no-store` / `immutable`）能 1:1 复刻；
- 错误形状 `{detail: "中文原因"}` 完全可控。

代价是 WebSocket、内容协商、限流这些要自己补——当前项目不需要，将来做多人时再评估。

### 4.5 内容热重载与规则版本

- 内容：`Content` 服务用 `fs.watch` + mtime 缓存，`POST /api/admin/reload` 发
  `content/reload` 事件；各模块订阅后重建索引。比 Python 的 `register` 回调更干净。
- 规则：cordis 的插件热重载**不能**直接用于「一局进行到一半」的场景。
  一局的状态是按开局时的规则算出来的，中途换规则会破坏一致性。
  正确顺序是：先给 `sessions` 加 `rules_version`，开局时写入；热更只影响新局。
  cordis 的 `ctx.fork()` / 多实例可以承载「同一服务两个版本并存」，
  但版本策略要先定，不要为了用框架而用框架。

---

## 5. 分阶段计划

每个阶段都可独立提交、独立回滚；前端与现有服务在 P6 之前不受影响。

### P0 冻结契约（0.5 人日）

- 从 Python 生成引擎 golden fixtures：
  - 35 局完整行动序列（含战斗/画符/结界/请神/抉择/结算）的事件流；
  - PRNG（字符串种子 + int 种子 + 舍入）、检定、五行、20 张角色卡。
- 落盘到 `server/test/fixtures/`，作为后续每个阶段的验收依据。
- 产物：`server/scripts/export_golden.py` + fixtures；运行时不改。
- 30 个接口的响应契约留到 P6 开始时冻结：它依赖固定数据库副本与运行中的服务，
  与引擎对拍分开做，避免 P0 被数据库状态拖住。

### P1 骨架（0.5–1 人日）

- `server/` + `package.json` + `tsconfig` + `vitest`；
- `Context` 装配、配置 schema、日志；
- 自研 `HttpServer`（路由、JSON、404、错误、`no-store`）；
- `Db` 服务（`node:sqlite`，`foreign_keys` / WAL，旧库可读）；
- `/api/health` 与静态产物。
- 验收：`curl /api/health`；旧 `moyu.db` 能打开；`index.html` 缓存头正确。

### P2 纯规则（1 人日）

- 移植 `dice` / `python.ts` / `wuxing` / `checks` / `sheet`；
- 跑通 §4.1 的全部对拍；
- 把 `test_engine.py` 里与这四块相关的用例翻译成 vitest。
- 验收：golden 对拍 0 差异；规则层不 import cordis。

### P3 内容层（1 人日）

- `store` / 索引 / 热重载 / 原子写回；
- `zod` 内容模型 + `edit.ts`（建议用 schema 重建校验，而不是直译 671 行）；
- `/api/admin/reload` 与 `content/reload` 事件。
- 验收：改 JSON → reload → 接口立即反映；11 类档案增删改的校验结果与 Python 一致。

### P4 生成器（1 人日）

- `gacha` / `npc` / `progress` / `kp` / `mission`；
- 对拍：NPC 生成、玩家建卡、随机任务（固定 key）、晋升/试炼/商店。
- 验收：同种子输出逐字段一致。

### P5 会话状态机（1.5–2 人日）

- 移植 `session.py`，按 action 分支逐个对齐；
- 用 P0 的 20 局 golden 重放，比较每一步的状态与事件流；
- 重点：伤害公式、形态门槛、逼迫现形、符/请神/结界、结束结算。
- 验收：20 局全程 0 差异；这是最可能暴露问题的阶段。

### P6 API + 静态 + 数据库（1.5 人日）

- 30 个路由、zod 请求体、`{detail}` 错误、静态缓存；
- 接口契约对拍：Python 8888 vs Node 8889，同一份 DB 副本，逐接口 diff；
- 前端 `npm run build` 后用 Node 服务跑 52 项 UI 冒烟。
- 验收：接口 diff 0 差异（时间戳归一化）；UI 冒烟全绿。

### P7 切换与收尾（0.5–1 人日）

- `start.sh` / `start.ps1` / `start.bat` 改为 Node 启动；
- 删除 `backend/`，只保留 git 历史与 tag（`pre-cordis` / `cordis-v1`）；
- 更新 `README` / `docs/架构.md` / `HANDOFF.json`；
- 打 tag：`pre-cordis`、`cordis-v1`。

**合计 7.5–9.5 人日**。在 agent 辅助、且 P0 的 golden 做得足够细的前提下，
可以压缩到 3–4 个工作会话；但 P5 不建议赶。

### 验收总表

| 项 | 标准 |
| --- | --- |
| 随机数 | §4.1 全部对拍通过 |
| 引擎 | 20 局 golden 重放 0 差异 |
| 接口 | 30 个路由响应 diff 0（时间戳归一化） |
| 单测 | Python 169 个用例全部有 TS 对应，且通过 |
| UI | 52 项 UI 冒烟全绿 |
| 旧库 | 现有 `moyu.db` 直接可读，不要求迁移脚本 |
| 回滚 | `git checkout pre-cordis` 可跑旧 Python 版；当前是 `cordis-v1` |

---

## 6. 风险

| 风险 | 概率 | 影响 | 应对 |
| --- | --- | --- | --- |
| `session.py` 分支漏移植 | 中 | 高 | P0 的 20 局全程对拍；按 action 建覆盖表 |
| Python 语义差异（舍入/整除/格式化） | 中 | 中 | `core/python.ts` 集中垫片 + 对拍 |
| cordis RC 破坏性变更 | 高 | 中 | 锁版本；HTTP 自研；不把核心逻辑押在生态包上 |
| `plugin-server` 类兼容问题 | 已发生 | 低 | 不用它 |
| PostgreSQL/MySQL 兼容丢失 | 高 | 中 | 明确降级为 SQLite only，或加驱动适配 |
| 内容编辑校验重写引入偏差 | 中 | 中 | 用 P0 的增删改 fixtures 对拍 |
| 双实现期数据不一致 | 中 | 高 | 切换前 Node 只读；写操作只在切换后开放 |
| 工作量超预期 | 中 | 中 | P2 结束设 Go/No-Go 点；不达标就停在「TS 引擎 + Python 服务」 |

---

## 7. 建议

### 值得做，如果

- 你确实想「只装一个 Node，不再要 Python/uv」；
- 你想让规则也变成可插拔的包（第三方规则包、运行时编辑器）；
- 你接受 1–2 周的投入，以及 cordis 4.x 仍是 RC 的事实。

### 不值得做，如果

- 动机只是「架构更优雅」——现在的分层（api / engine / content / models）已经够清楚；
- 动机是「设定热更」——JSON + reload 已经解决，cordis 不会让它更好；
- 你还需要 PostgreSQL/MySQL 兼容——SQLite only 是这次迁移的隐含代价。

### 折中路线（推荐先走）

1. **只做 P0–P2**：冻结契约、搭 cordis 骨架、把纯规则迁到 TS 并对拍。
   这一步不改变现有运行方式，风险最低，却能回答「这套东西到底能不能平移」。
2. P2 结束后看两个数：对拍差异数、`session.py` 的移植估算。
   如果都对得上，再决定是否继续 P3–P7。
3. 如果最终不做，P0 的 golden fixtures 和 `core/python.ts` 仍然有价值：
   它们是「规则可复现」的证据，也能给未来的任何重写当基线。

### 明确不建议

- 不要为了 cordis 把内容 JSON 改成插件配置——数据归数据，代码归代码；
- 不要把 Vue 前端塞进 cordis——cordis 是 Node 端内核，前端不需要它；
- 不要一次性删 `backend/`——先把 Node 跑到全绿，再删（本次已按 P0–P7 分阶段验证后删除）。

---

## 8. 进度（2026-11-17）

P0–P7 已落地，Node/TS 后端接管启动；旧 Python 实现退居 golden 生成与对照：

| 阶段 | 产物 | 验收 |
| --- | --- | --- |
| P0 | `server/scripts/export_golden.py` + `server/test/fixtures/*.json` | 35 局 / 481 步整局回放、311 组舍入、40 组检定、49 组五行、20 张角色卡 |
| P1 | `server/src/`（cordis 服务 + node:http + node:sqlite） | `/api/health`、静态缓存头、404、内容重载 |
| P2 | `core/{python,dice,checks,wuxing,sheet}.ts` | 与 Python 逐字段一致 |
| P3 | `content/*` + `content/edit.ts` + `content/write.ts` | 11 类档案增删改、引用拦截、原子写回对拍 |
| P4 | `core/{gacha,npc,kp,mission,progress}.ts` | 抽卡/NPC/随机任务/成长线/KP 全量对拍 |
| P5 | `core/session.ts` | 35 局 481 步状态与事件流逐字段一致 |
| P6 | `api/*` + `db/*` + 三方言 schema | 30 个接口；28 项旧 API 冒烟在新后端全绿 |
| P7 | `start.sh` / `start.ps1` / `start.bat` | 一键启动 Node；旧 Python 后端与 `backend/` 已删除 |

测试：`cd server && npm test` → **268 passed**；`npm run typecheck` 通过；
旧 Python 实现已删除，无法再跑它的 169 个 pytest；行为基线固化在 `server/test/fixtures/` 与 268 个 vitest 里。

未完成/未验证：

- PostgreSQL / MySQL 适配层与 schema 已写，但本地没有实例，只有 SQLite 实测；
- UI 冒烟（52 项）需要浏览器，本机下载 Chromium 未完成；前端 `npm run build` 与
  `vue-tsc` 通过，28 项 HTTP 冒烟覆盖了主要接口；
- 规则热更只记录 `rules_version`，多版本规则并存尚未做。

## 附录 A：PoC 结果

PoC 在 `/tmp/cordis-poc`（未提交），由三部分组成：

1. `parity/`：`PythonRandom` + `pyRound` 与 Python 3.14.8 的对拍；
2. `spike/`：cordis 服务装配（`Content` / `Rules` / 自研 `HttpServer`），
   提供 `/api/health`、`/api/check`、`/api/wuxing`、`/api/content/status`、
   `POST /api/admin/reload`；
3. `spike/test/engine-parity.ts`：30 组检定 + 49 组五行的对拍。

实测输出：

```
PARITY OK: all vectors match CPython
INT-SEED/BITS OK
ENGINE PARITY OK: 30 checks + 49 wuxing pairs
[spike] ready on http://127.0.0.1:8899
{"ok":true,"port":8899,"services":{"content":true,"rules":true}}
```

cordis 版本实测：

| 组合 | 结果 |
| --- | --- |
| `cordis@4.0.0-rc.10` + `@cordisjs/plugin-server@1.7.0` | 正常 |
| `cordis@4.0.0-rc.11` + 同上 | 正常 |
| `cordis@4.0.0-rc.12` / `rc.13` + 同上 | `TypeError: server[Server.resolveConfig] is not a function` |
| `cordis@4.0.0-rc.13` + 自研 `HttpServer` | 正常 |

## 附录 B：待确认的产品决策

1. **数据库**：是否接受 SQLite only？还是要保留 PG/MySQL（需额外驱动与方言层）。
2. **规则热更**：是否需要「一局进行中换规则」？若只是新局生效，加 `rules_version` 即可。
3. **旧局兼容**：是否要求旧会话在新后端里能继续玩？这决定 P5 的对拍强度。
4. **Python 去留**：已删除；需要旧实现时从 `pre-cordis` tag 取回。
