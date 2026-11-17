-- PostgreSQL 基线：与 SQLite 表结构等价，JSON 列用 JSONB。
-- 时间列仍用 TEXT（'YYYY-MM-DD HH:MM:SS.ffffff'），三个方言共用一套读写代码。

CREATE TABLE IF NOT EXISTS characters (
  id SERIAL PRIMARY KEY,
  code VARCHAR(24) NOT NULL UNIQUE,
  name VARCHAR(32) NOT NULL,
  school VARCHAR(16) NOT NULL,
  element VARCHAR(8) NOT NULL,
  rarity VARCHAR(8) NOT NULL,
  rank VARCHAR(8) NOT NULL,
  merit INTEGER NOT NULL,
  attrs JSONB NOT NULL,
  traits JSONB NOT NULL,
  approval JSONB NOT NULL,
  notes TEXT NOT NULL,
  seed VARCHAR(32) NOT NULL,
  kind VARCHAR(8) NOT NULL,
  city VARCHAR(16) NOT NULL,
  events JSONB NOT NULL,
  mission VARCHAR(24),
  difficulty INTEGER NOT NULL,
  reward INTEGER NOT NULL,
  completed_sessions INTEGER NOT NULL,
  karma_good INTEGER NOT NULL,
  karma_debt INTEGER NOT NULL,
  mind_trial_passed INTEGER NOT NULL,
  trial_attempts INTEGER NOT NULL,
  items JSONB NOT NULL,
  ascensions JSONB NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_characters_city ON characters (city);
CREATE INDEX IF NOT EXISTS ix_characters_kind ON characters (kind);
CREATE INDEX IF NOT EXISTS ix_characters_rarity ON characters (rarity);
CREATE INDEX IF NOT EXISTS ix_characters_school ON characters (school);

CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  code VARCHAR(24) NOT NULL UNIQUE,
  character_id INTEGER NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  scenario_id VARCHAR(24) NOT NULL,
  status VARCHAR(12) NOT NULL,
  state JSONB NOT NULL,
  seed VARCHAR(32) NOT NULL,
  rules_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_sessions_scenario_id ON sessions (scenario_id);
CREATE INDEX IF NOT EXISTS ix_sessions_status ON sessions (status);

CREATE TABLE IF NOT EXISTS session_logs (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  kind VARCHAR(16) NOT NULL,
  severity VARCHAR(8) NOT NULL,
  text TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_session_logs_session_id ON session_logs (session_id);
