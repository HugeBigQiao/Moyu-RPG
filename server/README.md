# server/ · Node/TS 后端（cordis）

这是 `docs/cordis迁移.md` 里 P0–P7 的产物：cordis 骨架 + 纯规则引擎 + 30 个接口。
**它已经接管启动**：`start.sh` / `start.bat` 现在起的是 Node 后端；
旧 Python 实现已删除；现在只有这一套运行时。

## 当前进度

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| P0 | 冻结 golden 契约（PRNG / 检定 / 五行 / 角色卡 / 35 局回放） | 完成 |
| P1 | cordis 骨架：Content / Db / Rules / Http 服务 | 完成 |
| P2 | dice / python / checks / wuxing / sheet，全部对拍 | 完成 |
| P3 | 内容层、11 类档案编辑、原子写回 | 完成 |
| P4 | gacha / npc / kp / mission / progress，全部对拍 | 完成 |
| P5 | session 状态机，35 局 481 步回放逐字段一致 | 完成 |
| P6 | 30 个接口、SQLite/PG/MySQL 适配、静态产物 | 完成 |
| P7 | 启动脚本切到 Node | 完成 |

## 跑起来

要求 **Node >= 24**（用到原生 TS 执行与 `node:sqlite`；已在 Node 24.13（Windows）与 26.8.1 验证）。

```bash
cd server
npm install
npm start                 # 默认 http://127.0.0.1:8888
npm test                  # 268 个测试
npm run typecheck         # tsc --noEmit
```

环境变量（都有默认值，默认指向 `server/data/` 与 `frontend/dist/`）：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `MOYU_HOST` | `127.0.0.1` | 监听地址 |
| `MOYU_PORT` | `8888` | 端口 |
| `MOYU_CONTENT_DIR` | `server/data/content` | 内容 JSON |
| `MOYU_DATABASE_URL` | `sqlite://<repo>/server/data/moyu.db` | `sqlite://` / `postgresql://` / `mysql://`（不存在会建表） |
| `MOYU_FRONTEND_DIST` | `frontend/dist` | 前端产物；没有就只提供 `/api` |

接口与旧 FastAPI 一一对应（30 个），另加一个 `GET /api/health` 供启动脚本探活。
完整清单见 `docs/接口.md`。

## 装配：cordis.yml（L1）

生产入口 `src/index.ts` 用 `@cordisjs/loader` 读 `server/cordis.yml`：

- 每个条目是一个插件，`name` 相对 `server/` 解析，配置写在 `config` 下；
- 启动顺序由插件里的 `static inject` 推导，不依赖条目书写顺序；
- 每个插件可以导出 `Config`（schemastery），loader 启动时校验并填默认值；
- 配置值支持 `!!js` 表达式，所以 `MOYU_PORT` / `MOYU_HOST` / `MOYU_DATABASE_URL`
  能覆盖 YAML 里的默认值；
- 插件模块必须**默认导出**组件（`export default Content` 之类），否则 loader 拿不到。

`src/app.ts` 的 `createApp()` 仍保留给测试：随机端口、临时内容目录、临时数据库。
代价是插件清单有两处（`cordis.yml` 与 `createApp`），改插件时要一起看。

## 对拍怎么跑

`test/fixtures/*.json` 是迁移前从 Python 引擎导出的「标准答案」，已冻结在仓库里。
需要重生成时，可以从 git 历史里取回迁移前的 Python 实现（tag `pre-cordis`）再跑它；
日常开发不需要 Python。

`test/parity/` 下的测试逐字段比对；任何一处漂移都会失败。
`test/fixtures/sessions.json` 是 P5 的验收基线：35 局、481 步，覆盖勘查、战斗、
画符、用符、结界、请神、抉择与结算。`test/fixtures/{gacha,npc,progress,kp,edit}.json` 覆盖生成器、成长线与档案编辑。

## 目录

```
src/
  core/          纯函数引擎（不 import cordis）
    python.ts    pyRound / pyInt / pyFloorDiv / signed / fixed
    dice.ts      CPython random.Random 的逐位兼容实现 + Roller
    checks.ts    d100 检定
    wuxing.ts    五行生克
    sheet.ts     角色卡计算
    types.ts     共用类型
  content/       内容加载与索引（store / traits / shop）
  db/            node:sqlite：连接、基线 schema、事务
  plugins/       cordis 服务：content / db / rules / http / api / health
  app.ts         程序化装配（仅测试用）
  index.ts       进程入口（loader + cordis.yml）
cordis.yml       loader 的插件清单与配置
test/
  parity/        与冻结 golden 的对拍
  fixtures/      迁移前导出的标准答案
  api.test.ts    起真实 HTTP 服务走一遍接口
  http.test.ts   缓存头/404/重载
  db.test.ts     建表/PRAGMA/事务/关闭
scripts/
  api-smoke.ts       对已启动的服务打 28 项冒烟
```

## 两个刻意的决定

1. **不用 `@cordisjs/plugin-server`**：1.7.0 与 cordis rc.12+ 不兼容
   （`Service.resolveConfig` 被移除），HTTP 层自己写了约 200 行。
   cordis 只负责服务/依赖/生命周期，不把核心逻辑押在 RC 生态包上。
2. **规则引擎不 import cordis**：`core/*` 是纯函数，cordis 只在 `plugins/*` 里做装配。
   这样引擎可以单独单测、对拍、回放，将来换不换内核都不影响规则。

## 已知限制

- PostgreSQL / MySQL 的适配层与 schema 已写，但本地没有实例，只有 SQLite 实测。
- 规则热更只记 `rules_version`，多版本规则并存尚未做。
- 同一会话并发 `act` 仍是读-改-写：SQLite 事务已串行，但没有版本号，
  两个并发请求会按同一份旧状态各结算一次；单机单用户可接受。
- 内容自动重载已生效（改 `data/content/*.json` 后约 200ms 重读）；
  跨多个文件的写回不是原子的，中途失败会留下部分新文件。
- `server/.env` **不会**自动加载：环境变量请直接 `export MOYU_*`（或用 shell 前缀）。
  旧 `backend/.env` 里的 `sqlite+aiosqlite://…` 不再适用，PG/MySQL 用 `postgresql://` / `mysql://` 前缀。
- 双装配路径：`cordis.yml` 与 `createApp()` 各有一份插件清单，新增插件要两处都改；
  想收敛成一份，让测试也走 loader（`@cordisjs/include` 支持 `initial` 配置）。
- 旧库迁移：把旧 `backend/data/moyu.db` 复制成 `server/data/moyu.db` 即可；
  启动时自动补 `sessions.rules_version` 列，老数据不用改。

## 测试环境的坑（Windows）

Node 24.13 在 Windows 上对**非 ASCII 路径**做 `fs.cpSync` 递归拷贝会直接崩（0xC0000409）。
测试里的目录拷贝已改用异步 `fs.promises.cp`；以后新增测试也别用 `cpSync` 拷目录。
