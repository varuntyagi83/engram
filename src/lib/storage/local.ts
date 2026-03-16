// src/lib/storage/local.ts
// SQLite implementation of StorageAdapter via better-sqlite3.
// Synchronous DB calls wrapped in Promise for interface compatibility.
// Zero cloud dependencies — works fully offline.

import Database from 'better-sqlite3'
import { readFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type {
  StorageAdapter, Memory, MemoryInput, MemoryType,
  Thread, ThreadInput, ThreadStatus, UserProfile,
  ExportPayload, HealthStats, GetMemoriesOpts, SearchOpts,
} from './types'

// ── DB path resolution ────────────────────────────────────

function getDbPath(): string {
  if (process.env.MEMORY_ENGINE_DB_PATH) {
    return process.env.MEMORY_ENGINE_DB_PATH.replace('~', homedir())
  }
  const dir = join(homedir(), '.memory-engine')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'db.sqlite')
}

function applySchema(db: Database.Database): void {
  const candidates = [
    join(process.cwd(), 'database', 'local-schema.sql'),
    join(__dirname, '../../../database/local-schema.sql'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) {
      db.exec(readFileSync(p, 'utf-8'))
      return
    }
  }
}

// ── Row mappers ───────────────────────────────────────────

function toMemory(r: any): Memory {
  return {
    id: r.id, userId: r.user_id, type: r.memory_type as MemoryType,
    content: r.content, importance: r.importance,
    relevanceScore: r.relevance_score ?? 1.0,
    sessionId: r.session_id ?? null,
    tags: (() => { try { return JSON.parse(r.tags ?? '[]') } catch (e) { console.warn('[storage] toMemory: failed to parse tags JSON, defaulting to []:', e); return [] } })(),
    decayedAt: r.decayed_at ?? null,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

function toThread(r: any): Thread {
  return {
    id: r.id, userId: r.user_id, title: r.title,
    description: r.description ?? null, status: r.status,
    priority: r.priority, sessionId: r.session_id ?? null,
    resolvedAt: r.resolved_at ?? null,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

// ── LocalStorage ──────────────────────────────────────────

export class LocalStorage implements StorageAdapter {
  readonly mode = 'local' as const
  private db: Database.Database

  constructor(dbPath?: string) {
    const path = dbPath ?? getDbPath()
    this.db = new Database(path)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    applySchema(this.db)
  }

  // ── Memories ──────────────────────────────────────────

  async storeMemory(input: MemoryInput): Promise<string> {
    const id = crypto.randomUUID().replace(/-/g, '')
    this.db.prepare(`
      INSERT INTO memories (id, user_id, memory_type, content, importance, session_id, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.userId ?? process.env.MEMORY_ENGINE_USER_ID ?? 'default',
      input.type, input.content, input.importance,
      input.sessionId ?? null,
      JSON.stringify(input.tags ?? []),
    )
    return id
  }

  async getMemories(userId: string, opts: GetMemoriesOpts = {}): Promise<Memory[]> {
    let sql = `SELECT * FROM memories WHERE user_id = ?`
    const p: any[] = [userId]
    if (!opts.includeDecayed) sql += ` AND decayed_at IS NULL`
    if (opts.type)      { sql += ` AND memory_type = ?`; p.push(opts.type) }
    if (opts.sessionId) { sql += ` AND session_id = ?`;  p.push(opts.sessionId) }
    sql += ` ORDER BY relevance_score DESC, importance DESC, created_at DESC`
    if (opts.limit) { sql += ` LIMIT ?`; p.push(opts.limit) }
    return (this.db.prepare(sql).all(...p) as any[]).map(toMemory)
  }

  async searchMemories(userId: string, query: string, opts: SearchOpts = {}): Promise<Memory[]> {
    if (!query.trim()) return this.getMemories(userId, { limit: opts.limit ?? 10 })
    const limit = opts.limit ?? 10
    let typeClause = ''
    if (opts.type) {
      typeClause = 'AND m.memory_type = ?'
    }
    const params: any[] = [query, userId]
    if (opts.type) params.push(opts.type)
    params.push(limit)
    const rows = this.db.prepare(`
      SELECT m.* FROM memories m
      JOIN memories_fts fts ON m.rowid = fts.rowid
      WHERE fts.memories_fts MATCH ?
        AND m.user_id = ?
        AND m.decayed_at IS NULL
        ${typeClause}
      ORDER BY rank, m.importance DESC
      LIMIT ?
    `).all(...params) as any[]
    return rows.map(toMemory)
  }

  async deleteMemory(id: string): Promise<void> {
    this.db.prepare(`UPDATE memories SET decayed_at = datetime('now') WHERE id = ?`).run(id)
  }

  async updateDecayScores(userId?: string): Promise<void> {
    if (userId) {
      await this.updateRelevanceScores(userId)
    } else {
      const rows = this.db.prepare(
        `SELECT DISTINCT user_id FROM memories WHERE decayed_at IS NULL`
      ).all() as any[]
      for (const row of rows) {
        await this.updateRelevanceScores(row.user_id)
      }
    }
  }

  async updateRelevanceScores(userId: string): Promise<number> {
    // Decay: importance × e^(-k × age_days)
    // k by type × importance modifier (importance=5 → k×0.1)
    const result = this.db.prepare(`
      UPDATE memories SET
        relevance_score = ROUND(
          importance * exp(
            -(CASE memory_type
                WHEN 'episodic'   THEN CASE WHEN importance=5 THEN 0.005  ELSE 0.05  END
                WHEN 'semantic'   THEN CASE WHEN importance=5 THEN 0.0005 ELSE 0.005 END
                WHEN 'preference' THEN CASE WHEN importance=5 THEN 0.0002 ELSE 0.002 END
                WHEN 'procedural' THEN CASE WHEN importance=5 THEN 0.0001 ELSE 0.001 END
              END)
            * CAST((julianday('now') - julianday(created_at)) AS REAL)
          ), 4
        )
      WHERE user_id = ? AND decayed_at IS NULL
    `).run(userId)

    // Soft-delete below threshold
    this.db.prepare(`
      UPDATE memories SET decayed_at = datetime('now')
      WHERE user_id = ? AND decayed_at IS NULL AND relevance_score < 0.05
    `).run(userId)

    return result.changes
  }

  // ── Profile ───────────────────────────────────────────

  async setProfileKey(userId: string, key: string, value: string): Promise<void> {
    this.db.prepare(`
      INSERT INTO user_profiles (user_id, profile_key, profile_value, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, profile_key) DO UPDATE
        SET profile_value = excluded.profile_value,
            updated_at    = excluded.updated_at
    `).run(userId, key, value)
  }

  async getProfile(userId: string): Promise<UserProfile> {
    const rows = this.db.prepare(
      `SELECT profile_key, profile_value FROM user_profiles WHERE user_id = ?`
    ).all(userId) as any[]
    return Object.fromEntries(rows.map(r => [r.profile_key, r.profile_value]))
  }

  async upsertProfile(userId: string, updates: Record<string, string>): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO user_profiles (user_id, profile_key, profile_value, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, profile_key) DO UPDATE
        SET profile_value = excluded.profile_value,
            updated_at    = excluded.updated_at
    `)
    const tx = this.db.transaction((entries: [string, string][]) => {
      for (const [k, v] of entries) if (v) stmt.run(userId, k, v)
    })
    tx(Object.entries(updates))
  }

  // ── Threads ───────────────────────────────────────────

  async storeThread(input: ThreadInput): Promise<string> {
    const id = crypto.randomUUID().replace(/-/g, '')
    const uid = input.userId ?? process.env.MEMORY_ENGINE_USER_ID ?? 'default'
    this.db.prepare(`
      INSERT INTO threads (id, user_id, title, description, status, priority, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, title) DO UPDATE SET
        status     = CASE WHEN excluded.status != 'open' THEN excluded.status ELSE threads.status END,
        priority   = CASE WHEN excluded.priority != 'medium' THEN excluded.priority ELSE threads.priority END,
        updated_at = datetime('now')
    `).run(id, uid, input.title, input.description ?? null,
           input.status ?? 'open', input.priority ?? 'medium', input.sessionId ?? null)
    const row = this.db.prepare(`SELECT id FROM threads WHERE user_id = ? AND title = ?`).get(uid, input.title) as any
    return row.id
  }

  async getThreads(userId: string, status?: ThreadStatus | ThreadStatus[]): Promise<Thread[]> {
    if (!status) {
      return (this.db.prepare(
        `SELECT * FROM threads WHERE user_id = ? ORDER BY
         CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         created_at DESC`
      ).all(userId) as any[]).map(toThread)
    }
    const statuses = Array.isArray(status) ? status : [status]
    const ph = statuses.map(() => '?').join(',')
    return (this.db.prepare(
      `SELECT * FROM threads WHERE user_id = ? AND status IN (${ph})
       ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       created_at DESC`
    ).all(userId, ...statuses) as any[]).map(toThread)
  }

  async updateThread(id: string, updates: Partial<Pick<Thread, 'status'|'priority'|'title'|'description'>>): Promise<void> {
    const sets: string[] = []
    const vals: any[] = []
    if (updates.status !== undefined) {
      sets.push('status = ?'); vals.push(updates.status)
      if (updates.status === 'resolved') sets.push(`resolved_at = datetime('now')`)
    }
    if (updates.priority    !== undefined) { sets.push('priority = ?');    vals.push(updates.priority) }
    if (updates.title       !== undefined) { sets.push('title = ?');       vals.push(updates.title) }
    if (updates.description !== undefined) { sets.push('description = ?'); vals.push(updates.description) }
    if (!sets.length) return
    vals.push(id)
    this.db.prepare(`UPDATE threads SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  }

  // ── Sessions ──────────────────────────────────────────

  async startSession(userId: string, sessionId: string): Promise<void> {
    // TODO: increment message_count when messages table exists
    this.db.prepare(`INSERT OR IGNORE INTO sessions (id, user_id) VALUES (?, ?)`).run(sessionId, userId)
  }

  async endSession(sessionId: string, summary?: string): Promise<void> {
    this.db.prepare(`UPDATE sessions SET ended_at = datetime('now'), summary = ? WHERE id = ?`).run(summary ?? null, sessionId)
  }

  // ── Export / Import ───────────────────────────────────

  getDistinctUserIds(): string[] {
    const rows = this.db.prepare(
      `SELECT DISTINCT user_id FROM memories WHERE decayed_at IS NULL`
    ).all() as any[]
    return rows.map(r => r.user_id)
  }

  async exportAll(userId: string): Promise<ExportPayload> {
    const [memories, profile, threads] = await Promise.all([
      this.getMemories(userId, { includeDecayed: false }),
      this.getProfile(userId),
      this.getThreads(userId),
    ])
    const sessions = (this.db.prepare(`SELECT * FROM sessions WHERE user_id = ?`).all(userId) as any[]).map(r => ({
      id: r.id, userId: r.user_id, summary: r.summary,
      messageCount: r.message_count, startedAt: r.started_at, endedAt: r.ended_at,
    }))
    return { version: '1.0', exportedAt: new Date().toISOString(), userId, mode: 'local', profile, memories, threads, sessions }
  }

  async importAll(payload: ExportPayload): Promise<{ imported: number; skipped: number }> {
    let imported = 0; let skipped = 0
    const check = this.db.prepare(`SELECT id FROM memories WHERE content = ? AND user_id = ?`)
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO memories (id,user_id,memory_type,content,importance,session_id,tags,created_at)
      VALUES (?,?,?,?,?,?,?,?)
    `)
    const tx = this.db.transaction(() => {
      for (const m of payload.memories) {
        if (check.get(m.content, m.userId)) { skipped++; continue }
        insert.run(m.id, m.userId, m.type, m.content, m.importance, m.sessionId, JSON.stringify(m.tags), m.createdAt)
        imported++
      }
    })
    tx()
    return { imported, skipped }
  }

  // ── Health ────────────────────────────────────────────

  async healthStats(userId: string): Promise<HealthStats> {
    const s = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER(WHERE decayed_at IS NULL) as active,
        COUNT(*) FILTER(WHERE decayed_at IS NOT NULL) as decayed,
        COUNT(*) FILTER(WHERE memory_type='episodic'   AND decayed_at IS NULL) as episodic,
        COUNT(*) FILTER(WHERE memory_type='semantic'   AND decayed_at IS NULL) as semantic,
        COUNT(*) FILTER(WHERE memory_type='preference' AND decayed_at IS NULL) as preference,
        COUNT(*) FILTER(WHERE memory_type='procedural' AND decayed_at IS NULL) as procedural,
        ROUND(AVG(importance)      FILTER(WHERE decayed_at IS NULL), 2) as avg_imp,
        ROUND(AVG(relevance_score) FILTER(WHERE decayed_at IS NULL), 2) as avg_score,
        COUNT(*) FILTER(WHERE relevance_score < 0.2 AND decayed_at IS NULL) as stale,
        CAST(julianday('now') - julianday(MIN(created_at)) AS INTEGER) as oldest_days
      FROM memories WHERE user_id = ?
    `).get(userId) as any

    const t = this.db.prepare(`
      SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status != 'resolved') as open
      FROM threads WHERE user_id = ?
    `).get(userId) as any

    const profileCount = (this.db.prepare(
      `SELECT COUNT(*) as c FROM user_profiles WHERE user_id = ?`
    ).get(userId) as any).c

    // Health score 0–100
    const dupeRate  = s.total > 0 ? (s.decayed / s.total) : 0
    const staleRate = s.active > 0 ? (s.stale / s.active) : 0
    let score = 100
    if (dupeRate  > 0.2) score -= 10
    if (staleRate > 0.3) score -= 15
    if (t.open    > 10)  score -= 5
    if ((s.avg_imp ?? 0) < 2.5) score -= 10
    score = Math.max(0, score)

    return {
      totalMemories: s.total, activeMemories: s.active, decayedMemories: s.decayed,
      byType: { episodic: s.episodic, semantic: s.semantic, preference: s.preference, procedural: s.procedural },
      avgImportance: s.avg_imp ?? 0, avgRelevanceScore: s.avg_score ?? 0,
      staleCount: s.stale, threadCount: t.total, openThreadCount: t.open,
      profileKeyCount: profileCount, oldestMemoryDays: s.oldest_days ?? 0,
      healthScore: score,
    }
  }

  close(): void { this.db.close() }
}
