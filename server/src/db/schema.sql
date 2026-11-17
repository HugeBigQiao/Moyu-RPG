-- SQLite 基线：与 backend/data/migrations/versions/8f9a32411a08 等价。
-- 表名、字段名、类型都不改；旧库可以直接被 Node 打开。
-- 时间列沿用 SQLAlchemy 的写法：TEXT 'YYYY-MM-DD HH:MM:SS.ffffff'。
-- JSON 列在 SQLite 里也是 TEXT，只是内容是一段 JSON。

CREATE TABLE IF NOT EXISTS characters (
  id INTEGER NOT NULL PRIMARY KEY,
  code VARCHAR(24) NOT NULL,
  name VARCHAR(32) NOT NULL,
  school VARCHAR(16) NOT NULL,
  element VARCHAR(8) NOT NULL,
  rarity VARCHAR(8) NOT NULL,
  rank VARCHAR(8) NOT NULL,
  merit INTEGER NOT NULL,
  attrs TEXT NOT NULL,
  traits TEXT NOT NULL,
  approval TEXT NOT NULL,
  notes TEXT NOT NULL,
  seed VARCHAR(32) NOT NULL,
  kind VARCHAR(8) NOT NULL,
  city VARCHAR(16) NOT NULL,
  events TEXT NOT NULL,
  mission VARCHAR(24),
  difficulty INTEGER NOT NULL,
  reward INTEGER NOT NULL,
  completed_sessions INTEGER NOT NULL,
  karma_good INTEGER NOT NULL,
  karma_debt INTEGER NOT NULL,
  mind_trial_passed INTEGER NOT NULL,
  trial_attempts INTEGER NOT NULL,
  items TEXT NOT NULL,
  ascensions TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_characters_city ON characters (city);
CREATE UNIQUE INDEX IF NOT EXISTS ix_characters_code ON characters (code);
CREATE INDEX IF NOT EXISTS ix_characters_kind ON characters (kind);
CREATE INDEX IF NOT EXISTS ix_characters_rarity ON characters (rarity);
CREATE INDEX IF NOT EXISTS ix_characters_school ON characters (school);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER NOT NULL PRIMARY KEY,
  code VARCHAR(24) NOT NULL,
  character_id INTEGER NOT NULL,
  scenario_id VARCHAR(24) NOT NULL,
  status VARCHAR(12) NOT NULL,
  state TEXT NOT NULL,
  seed VARCHAR(32) NOT NULL,
  rules_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT fk_sessions_character FOREIGN KEY (character_id)
    REFERENCES characters (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_sessions_code ON sessions (code);
CREATE INDEX IF NOT EXISTS ix_sessions_scenario_id ON sessions (scenario_id);
CREATE INDEX IF NOT EXISTS ix_sessions_status ON sessions (status);

CREATE TABLE IF NOT EXISTS session_logs (
  id INTEGER NOT NULL PRIMARY KEY,
  session_id INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  kind VARCHAR(16) NOT NULL,
  severity VARCHAR(8) NOT NULL,
  text TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT fk_session_logs_session FOREIGN KEY (session_id)
    REFERENCES sessions (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_session_logs_session_id ON session_logs (session_id);
