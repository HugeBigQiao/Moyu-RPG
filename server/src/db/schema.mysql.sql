-- MySQL 基线：与 SQLite 表结构等价，JSON 列用 JSON。
-- 时间列仍用 TEXT；索引写在建表语句里，避免 MySQL 不支持 CREATE INDEX IF NOT EXISTS。

CREATE TABLE IF NOT EXISTS characters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(24) NOT NULL UNIQUE,
  name VARCHAR(32) NOT NULL,
  school VARCHAR(16) NOT NULL,
  element VARCHAR(8) NOT NULL,
  rarity VARCHAR(8) NOT NULL,
  `rank` VARCHAR(8) NOT NULL,
  merit INT NOT NULL,
  attrs JSON NOT NULL,
  traits JSON NOT NULL,
  approval JSON NOT NULL,
  notes TEXT NOT NULL,
  seed VARCHAR(32) NOT NULL,
  kind VARCHAR(8) NOT NULL,
  city VARCHAR(16) NOT NULL,
  events JSON NOT NULL,
  mission VARCHAR(24),
  difficulty INT NOT NULL,
  reward INT NOT NULL,
  completed_sessions INT NOT NULL,
  karma_good INT NOT NULL,
  karma_debt INT NOT NULL,
  mind_trial_passed INT NOT NULL,
  trial_attempts INT NOT NULL,
  items JSON NOT NULL,
  ascensions JSON NOT NULL,
  created_at TEXT NOT NULL,
  KEY ix_characters_city (city),
  KEY ix_characters_kind (kind),
  KEY ix_characters_rarity (rarity),
  KEY ix_characters_school (school)
);

CREATE TABLE IF NOT EXISTS sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(24) NOT NULL UNIQUE,
  character_id INT NOT NULL,
  scenario_id VARCHAR(24) NOT NULL,
  status VARCHAR(12) NOT NULL,
  state JSON NOT NULL,
  seed VARCHAR(32) NOT NULL,
  rules_version INT NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  KEY ix_sessions_scenario_id (scenario_id),
  KEY ix_sessions_status (status),
  CONSTRAINT fk_sessions_character FOREIGN KEY (character_id)
    REFERENCES characters (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS session_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  seq INT NOT NULL,
  kind VARCHAR(16) NOT NULL,
  severity VARCHAR(8) NOT NULL,
  text TEXT NOT NULL,
  payload JSON NOT NULL,
  created_at TEXT NOT NULL,
  KEY ix_session_logs_session_id (session_id),
  CONSTRAINT fk_session_logs_session FOREIGN KEY (session_id)
    REFERENCES sessions (id) ON DELETE CASCADE
);
