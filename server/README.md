# server/ · Node/TS 后端（cordis 迁移中）

这是 `docs/cordis迁移.md` 里 P0–P2 的产物：cordis 骨架 + 纯规则引擎。
**它还没有接管启动**——`start.sh` / `start.bat` 仍然起 Python 后端；两者可以并存，
方便对拍与回滚。

## 当前进度

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| P0 | 冻结 golden 契约（PRNG / 检定 / 五行 / 角色卡 / 35 局回放） | 完成 |
| P1 | cordis 骨架：Content / Db / Rules / Http 服务，健康检查与静态产物 | 完成 |
| P2 | 移植 dice / python / checks / wuxing / sheet，全部对拍通过 | 完成 |
| P3–P7 | 内容编辑、生成器、会话状态机、30 个接口、切换启动 | 未开始 |

## 跑起来

要求 **Node >= 24**（用到原生 TS 执行与 `node:sqlite`；本机 26.8.1 验证）。

```bash
cd server
npm install
npm start                 # 默认 http://127.0.0.1:8888
npm test                  # 134 个测试
npm run typecheck         # tsc --noEmit
```

环境变量（都有默认值，默认指向仓库里的 `backend/data/` 与 `frontend/dist/`）：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `MOYU_HOST` | `127.0.0.1` | 监听地址 |
| `MOYU_PORT` | `8888` | 端口 |
| `MOYU_CONTENT_DIR` | `backend/data/content` | 内容 JSON |
| `MOYU_DB_FILE` | `backend/data/moyu.db` | SQLite 文件（不存在会建） |
| `MOYU_FRONTEND_DIST` | `frontend/dist` | 前端产物；没有就只提供 `/api` |

已实现的接口（临时的，P6 会被完整的 30 个替换）：

- `GET /api/health` — 服务状态
- `GET /api/content/status` — 内容加载状态
- `POST /api/admin/reload` — 强制重读内容 JSON

## 对拍怎么跑

`test/fixtures/*.json` 是 Python 侧生成的「标准答案」。重生成：

```bash
cd server
npm run golden            # 内部：cd ../backend && uv run python ../server/scripts/export_golden.py
```

`test/parity/` 下的测试逐字段比对；任何一处与 Python 不一致都会失败。
`test/fixtures/sessions.json` 是 P5 的验收基线：35 局、481 步，覆盖勘查、战斗、
画符、用符、结界、请神、抉择与结算。

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
  plugins/       cordis 服务：content / db / rules / http
  app.ts         装配（可被测试复用）
  index.ts       进程入口
test/
  parity/        与 Python 的 golden 对拍
  fixtures/      Python 生成的标准答案
  http.test.ts   起真实 HTTP 服务测缓存头/404/重载
  db.test.ts     建表/PRAGMA/事务/关闭
scripts/
  export_golden.py   从 Python 引擎导出 fixtures
```

## 两个刻意的决定

1. **不用 `@cordisjs/plugin-server`**：1.7.0 与 cordis rc.12+ 不兼容
   （`Service.resolveConfig` 被移除），HTTP 层自己写了约 200 行。
   cordis 只负责服务/依赖/生命周期，不把核心逻辑押在 RC 生态包上。
2. **规则引擎不 import cordis**：`core/*` 是纯函数，cordis 只在 `plugins/*` 里做装配。
   这样引擎可以单独单测、对拍、回放，将来换不换内核都不影响规则。

## 已知限制

- 只支持 SQLite；Python 版的 PostgreSQL / MySQL 兼容没有带过来。
- `Db` 只做了基线建表与 `user_version`，增量迁移在 P6。
- 请求体校验还没有 zod 化；P6 会按 30 个接口补。
- 启动脚本、`backend/` 的删除都留到 P7，避免现在就要二选一。
