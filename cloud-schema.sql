-- Memory Engine — Supabase Cloud Schema (Pro)
-- Run in Supabase SQL Editor after upgrading to Pro
-- Project: sundaybi · Region: europe-west3

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Agents ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS me_agents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

INSERT INTO me_agents (id, name, description) VALUES
  ('00000000-0000-0000-0000-000000000001', 'personal', 'Personal memory'),
  ('00000000-0000-0000-0000-000000000002', 'adforge',  'AdForge agent'),
  ('00000000-0000-0000-0000-000000000003', 'voltic',   'Voltic agent')
ON CONFLICT (id) DO NOTHING;

-- ── Memories ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS me_memories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        UUID REFERENCES me_agents(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL,
  memory_type     TEXT NOT NULL CHECK(memory_type IN ('episodic','semantic','preference','procedural')),
  content         TEXT NOT NULL,
  importance      INT NOT NULL DEFAULT 3 CHECK(importance BETWEEN 1 AND 5),
  relevance_score FLOAT DEFAULT 1.0,
  embedding       VECTOR(1536),
  session_id      TEXT,
  tags            TEXT[] DEFAULT '{}',
  decayed_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_me_mem_user   ON me_memories(agent_id, user_id);
CREATE INDEX IF NOT EXISTS idx_me_mem_active ON me_memories(agent_id, user_id) WHERE decayed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_me_mem_score  ON me_memories(relevance_score DESC) WHERE decayed_at IS NULL;

-- Semantic search via pgvector
CREATE OR REPLACE FUNCTION me_search_memories(
  p_agent_id UUID, p_user_id TEXT, p_embedding VECTOR(1536),
  p_limit INT DEFAULT 10, p_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE(id UUID, content TEXT, memory_type TEXT, importance INT,
              relevance_score FLOAT, similarity FLOAT)
LANGUAGE SQL STABLE AS $$
  SELECT m.id, m.content, m.memory_type, m.importance, m.relevance_score,
         1 - (m.embedding <=> p_embedding) AS similarity
  FROM me_memories m
  WHERE m.agent_id = p_agent_id
    AND m.user_id  = p_user_id
    AND m.decayed_at IS NULL
    AND m.embedding IS NOT NULL
    AND 1 - (m.embedding <=> p_embedding) > p_threshold
  ORDER BY m.embedding <=> p_embedding
  LIMIT p_limit;
$$;

-- Server-side decay scoring
CREATE OR REPLACE FUNCTION me_update_relevance_scores(
  p_agent_id UUID, p_user_id TEXT
)
RETURNS VOID LANGUAGE SQL AS $$
  UPDATE me_memories SET
    relevance_score = ROUND(CAST(
      importance * EXP(
        -(CASE memory_type
            WHEN 'episodic'   THEN CASE WHEN importance=5 THEN 0.005  ELSE 0.05  END
            WHEN 'semantic'   THEN CASE WHEN importance=5 THEN 0.0005 ELSE 0.005 END
            WHEN 'preference' THEN CASE WHEN importance=5 THEN 0.0002 ELSE 0.002 END
            WHEN 'procedural' THEN CASE WHEN importance=5 THEN 0.0001 ELSE 0.001 END
          END)
        * EXTRACT(EPOCH FROM (now() - created_at)) / 86400.0
      ) AS NUMERIC), 4)
  WHERE agent_id = p_agent_id AND user_id = p_user_id AND decayed_at IS NULL;

  UPDATE me_memories SET decayed_at = now()
  WHERE agent_id = p_agent_id AND user_id = p_user_id
    AND decayed_at IS NULL AND relevance_score < 0.05;
$$;

-- ── User profiles ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS me_user_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      UUID REFERENCES me_agents(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL,
  profile_key   TEXT NOT NULL,
  profile_value TEXT NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agent_id, user_id, profile_key)
);

-- ── Threads ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS me_threads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID REFERENCES me_agents(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open','in_progress','resolved','snoozed')),
  priority    TEXT NOT NULL DEFAULT 'medium'
    CHECK(priority IN ('low','medium','high','critical')),
  session_id  TEXT,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agent_id, user_id, title)
);

-- ── Sessions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS me_sessions (
  id            TEXT PRIMARY KEY,
  agent_id      UUID REFERENCES me_agents(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL,
  summary       TEXT,
  message_count INT DEFAULT 0,
  started_at    TIMESTAMPTZ DEFAULT now(),
  ended_at      TIMESTAMPTZ
);

-- ── API keys (Team tier) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS me_api_keys (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash            TEXT NOT NULL UNIQUE,
  key_prefix          TEXT NOT NULL,
  agent_id            UUID REFERENCES me_agents(id) ON DELETE CASCADE,
  user_id             TEXT,
  rate_limit_per_hour INT DEFAULT 1000,
  last_used_at        TIMESTAMPTZ,
  revoked_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS me_usage_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id           UUID REFERENCES me_api_keys(id),
  operation        TEXT,
  memory_count     INT,
  tokens_estimated INT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ── Health stats view ────────────────────────────────────────
CREATE OR REPLACE VIEW me_memory_health_stats AS
SELECT
  agent_id, user_id,
  COUNT(*)          FILTER(WHERE decayed_at IS NULL)                         AS active_count,
  COUNT(*)          FILTER(WHERE decayed_at IS NOT NULL)                     AS decayed_count,
  COUNT(*)          FILTER(WHERE memory_type='episodic'   AND decayed_at IS NULL) AS episodic_count,
  COUNT(*)          FILTER(WHERE memory_type='semantic'   AND decayed_at IS NULL) AS semantic_count,
  COUNT(*)          FILTER(WHERE memory_type='preference' AND decayed_at IS NULL) AS preference_count,
  COUNT(*)          FILTER(WHERE memory_type='procedural' AND decayed_at IS NULL) AS procedural_count,
  ROUND(AVG(importance)      FILTER(WHERE decayed_at IS NULL)::NUMERIC, 2)   AS avg_importance,
  ROUND(AVG(relevance_score) FILTER(WHERE decayed_at IS NULL)::NUMERIC, 2)   AS avg_relevance,
  COUNT(*)          FILTER(WHERE relevance_score < 0.2 AND decayed_at IS NULL) AS stale_count
FROM me_memories
GROUP BY agent_id, user_id;

-- ── Auto-update triggers ─────────────────────────────────────
CREATE OR REPLACE FUNCTION me_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN new.updated_at = now(); RETURN new; END;
$$;

CREATE TRIGGER me_memories_updated BEFORE UPDATE ON me_memories
  FOR EACH ROW EXECUTE FUNCTION me_set_updated_at();
CREATE TRIGGER me_threads_updated BEFORE UPDATE ON me_threads
  FOR EACH ROW EXECUTE FUNCTION me_set_updated_at();
