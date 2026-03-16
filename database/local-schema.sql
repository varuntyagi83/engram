-- Memory Engine — Local SQLite Schema
-- Auto-applied by scripts/init.ts on first run
-- Location: ~/.memory-engine/db.sqlite

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ── Memories ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memories (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id         TEXT NOT NULL DEFAULT 'default',
  memory_type     TEXT NOT NULL CHECK(memory_type IN ('episodic','semantic','preference','procedural')),
  content         TEXT NOT NULL,
  importance      INTEGER NOT NULL DEFAULT 3 CHECK(importance BETWEEN 1 AND 5),
  relevance_score REAL DEFAULT 1.0,
  session_id      TEXT,
  tags            TEXT DEFAULT '[]',
  decayed_at      TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mem_user    ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_mem_type    ON memories(user_id, memory_type);
CREATE INDEX IF NOT EXISTS idx_mem_active  ON memories(user_id) WHERE decayed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mem_score   ON memories(relevance_score DESC) WHERE decayed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mem_session ON memories(session_id);

-- FTS5 for full-text search (free tier semantic search replacement)
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  content, memory_type, tags,
  content=memories, content_rowid=rowid,
  tokenize='porter unicode61'
);

-- Keep FTS5 in sync automatically
CREATE TRIGGER IF NOT EXISTS fts_insert AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, content, memory_type, tags)
  VALUES (new.rowid, new.content, new.memory_type, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS fts_delete AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, memory_type, tags)
  VALUES ('delete', old.rowid, old.content, old.memory_type, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS fts_update AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, memory_type, tags)
  VALUES ('delete', old.rowid, old.content, old.memory_type, old.tags);
  INSERT INTO memories_fts(rowid, content, memory_type, tags)
  VALUES (new.rowid, new.content, new.memory_type, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS mem_updated_at AFTER UPDATE ON memories BEGIN
  UPDATE memories SET updated_at = datetime('now') WHERE id = new.id;
END;

-- ── User profiles ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id       TEXT NOT NULL,
  profile_key   TEXT NOT NULL,
  profile_value TEXT NOT NULL,
  updated_at    TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, profile_key)
);

-- ── Threads ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS threads (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id     TEXT NOT NULL DEFAULT 'default',
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open','in_progress','resolved','snoozed')),
  priority    TEXT NOT NULL DEFAULT 'medium'
    CHECK(priority IN ('low','medium','high','critical')),
  session_id  TEXT,
  resolved_at TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, title)
);

CREATE INDEX IF NOT EXISTS idx_thr_user ON threads(user_id, status);

CREATE TRIGGER IF NOT EXISTS thr_updated_at AFTER UPDATE ON threads BEGIN
  UPDATE threads SET updated_at = datetime('now') WHERE id = new.id;
END;

-- ── Sessions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL DEFAULT 'default',
  summary       TEXT,
  -- message_count is tracked as 0 (known gap: no messages table to derive count from)
  message_count INTEGER DEFAULT 0,
  started_at    TEXT DEFAULT (datetime('now')),
  ended_at      TEXT
);

-- ── Meta ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS _meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO _meta VALUES ('schema_version', '1');
INSERT OR IGNORE INTO _meta VALUES ('created_at', datetime('now'));
INSERT OR IGNORE INTO _meta VALUES ('provider', 'openai');
