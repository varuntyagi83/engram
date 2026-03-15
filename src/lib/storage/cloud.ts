// src/lib/storage/cloud.ts
// Supabase + pgvector implementation of StorageAdapter (Pro mode).
// Activated when MEMORY_ENGINE_MODE=cloud.
// Uses OpenAI text-embedding-3-small for semantic search.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import type {
  StorageAdapter, Memory, MemoryInput, MemoryType,
  Thread, ThreadInput, ThreadStatus, UserProfile,
  ExportPayload, HealthStats, GetMemoriesOpts, SearchOpts,
} from './types'

const DEFAULT_AGENT = '00000000-0000-0000-0000-000000000001'

function getSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key)
}

function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY')
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

async function embed(text: string): Promise<number[]> {
  const openai = getOpenAI()
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000),
  })
  return res.data[0].embedding
}

function toMemory(r: any): Memory {
  return {
    id: r.id, userId: r.user_id, type: r.memory_type as MemoryType,
    content: r.content, importance: r.importance,
    relevanceScore: r.relevance_score ?? 1.0,
    sessionId: r.session_id ?? null,
    tags: Array.isArray(r.tags) ? r.tags : [],
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

export class CloudStorage implements StorageAdapter {
  readonly mode = 'cloud' as const
  private sb: SupabaseClient
  private agentId: string

  constructor(agentId?: string) {
    this.sb = getSupabase()
    this.agentId = agentId ?? process.env.MEMORY_ENGINE_AGENT_ID ?? DEFAULT_AGENT
  }

  // ── Memories ──────────────────────────────────────────

  async storeMemory(input: MemoryInput): Promise<string> {
    const userId = input.userId ?? process.env.MEMORY_ENGINE_USER_ID ?? 'default'
    // Generate embedding for semantic search
    let embedding: number[] | null = null
    try { embedding = await embed(input.content) } catch { /* store without embedding */ }

    const { data, error } = await this.sb.from('me_memories').insert({
      agent_id: this.agentId, user_id: userId,
      memory_type: input.type, content: input.content,
      importance: input.importance, session_id: input.sessionId ?? null,
      tags: input.tags ?? [], embedding,
    }).select('id').single()

    if (error) throw new Error(error.message)
    return data.id
  }

  async getMemories(userId: string, opts: GetMemoriesOpts = {}): Promise<Memory[]> {
    let q = this.sb.from('me_memories')
      .select('*')
      .eq('agent_id', this.agentId)
      .eq('user_id', userId)
      .order('relevance_score', { ascending: false })
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false })

    if (!opts.includeDecayed) q = q.is('decayed_at', null)
    if (opts.type)      q = q.eq('memory_type', opts.type)
    if (opts.sessionId) q = q.eq('session_id', opts.sessionId)
    if (opts.limit)     q = q.limit(opts.limit)

    const { data, error } = await q
    if (error) throw new Error(error.message)
    return (data ?? []).map(toMemory)
  }

  async searchMemories(userId: string, query: string, opts: SearchOpts = {}): Promise<Memory[]> {
    if (!query.trim()) return this.getMemories(userId, { limit: opts.limit ?? 10 })

    let embedding: number[]
    try { embedding = await embed(query) } catch {
      // Fallback: text search if embedding fails
      const { data } = await this.sb.from('me_memories')
        .select('*').eq('agent_id', this.agentId).eq('user_id', userId)
        .is('decayed_at', null).ilike('content', `%${query}%`).limit(opts.limit ?? 10)
      return (data ?? []).map(toMemory)
    }

    const { data, error } = await this.sb.rpc('me_search_memories', {
      p_agent_id: this.agentId, p_user_id: userId,
      p_embedding: embedding,
      p_limit: opts.limit ?? 10,
      p_threshold: opts.threshold ?? 0.7,
    })
    if (error) throw new Error(error.message)
    return (data ?? []).map((r: any) => ({ ...r, type: r.memory_type, userId: r.user_id }))
  }

  async deleteMemory(id: string): Promise<void> {
    const { error } = await this.sb.from('me_memories')
      .update({ decayed_at: new Date().toISOString() }).eq('id', id)
    if (error) throw new Error(error.message)
  }

  async updateRelevanceScores(userId: string): Promise<number> {
    // Postgres handles decay math server-side for efficiency
    const { error } = await this.sb.rpc('me_update_relevance_scores', {
      p_agent_id: this.agentId, p_user_id: userId
    })
    if (error) throw new Error(error.message)
    return 0 // count not returned by RPC
  }

  // ── Profile ───────────────────────────────────────────

  async setProfileKey(userId: string, key: string, value: string): Promise<void> {
    const { error } = await this.sb.from('me_user_profiles').upsert({
      agent_id: this.agentId, user_id: userId,
      profile_key: key, profile_value: value,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'agent_id,user_id,profile_key' })
    if (error) throw new Error(error.message)
  }

  async getProfile(userId: string): Promise<UserProfile> {
    const { data, error } = await this.sb.from('me_user_profiles')
      .select('profile_key, profile_value')
      .eq('agent_id', this.agentId).eq('user_id', userId)
    if (error) throw new Error(error.message)
    return Object.fromEntries((data ?? []).map((r: any) => [r.profile_key, r.profile_value]))
  }

  async upsertProfile(userId: string, updates: Record<string, string>): Promise<void> {
    const rows = Object.entries(updates)
      .filter(([, v]) => v)
      .map(([k, v]) => ({
        agent_id: this.agentId, user_id: userId,
        profile_key: k, profile_value: v,
        updated_at: new Date().toISOString(),
      }))
    if (!rows.length) return
    const { error } = await this.sb.from('me_user_profiles')
      .upsert(rows, { onConflict: 'agent_id,user_id,profile_key' })
    if (error) throw new Error(error.message)
  }

  // ── Threads ───────────────────────────────────────────

  async storeThread(input: ThreadInput): Promise<string> {
    const userId = input.userId ?? process.env.MEMORY_ENGINE_USER_ID ?? 'default'
    const { data, error } = await this.sb.from('me_threads').upsert({
      agent_id: this.agentId, user_id: userId,
      title: input.title, description: input.description ?? null,
      status: input.status ?? 'open', priority: input.priority ?? 'medium',
      session_id: input.sessionId ?? null,
    }, { onConflict: 'agent_id,user_id,title' }).select('id').single()
    if (error) throw new Error(error.message)
    return data.id
  }

  async getThreads(userId: string, status?: ThreadStatus | ThreadStatus[]): Promise<Thread[]> {
    let q = this.sb.from('me_threads').select('*')
      .eq('agent_id', this.agentId).eq('user_id', userId)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false })
    if (status) {
      const statuses = Array.isArray(status) ? status : [status]
      q = q.in('status', statuses)
    }
    const { data, error } = await q
    if (error) throw new Error(error.message)
    return (data ?? []).map(toThread)
  }

  async updateThread(id: string, updates: Partial<Pick<Thread, 'status'|'priority'|'title'|'description'>>): Promise<void> {
    const payload: any = { ...updates }
    if (updates.status === 'resolved') payload.resolved_at = new Date().toISOString()
    const { error } = await this.sb.from('me_threads').update(payload).eq('id', id)
    if (error) throw new Error(error.message)
  }

  // ── Sessions ──────────────────────────────────────────

  async startSession(userId: string, sessionId: string): Promise<void> {
    await this.sb.from('me_sessions').upsert(
      { id: sessionId, agent_id: this.agentId, user_id: userId },
      { onConflict: 'id' }
    )
  }

  async endSession(sessionId: string, summary?: string): Promise<void> {
    await this.sb.from('me_sessions').update({ ended_at: new Date().toISOString(), summary: summary ?? null }).eq('id', sessionId)
  }

  // ── Export / Import ───────────────────────────────────

  async exportAll(userId: string): Promise<ExportPayload> {
    const [memories, profile, threads] = await Promise.all([
      this.getMemories(userId, { includeDecayed: false }),
      this.getProfile(userId),
      this.getThreads(userId),
    ])
    const { data: sessions } = await this.sb.from('me_sessions').select('*')
      .eq('agent_id', this.agentId).eq('user_id', userId)
    return {
      version: '1.0', exportedAt: new Date().toISOString(),
      userId, mode: 'cloud', profile, memories, threads,
      sessions: (sessions ?? []).map((r: any) => ({
        id: r.id, userId: r.user_id, summary: r.summary,
        messageCount: r.message_count, startedAt: r.started_at, endedAt: r.ended_at,
      })),
    }
  }

  async importAll(payload: ExportPayload): Promise<{ imported: number; skipped: number }> {
    let imported = 0; let skipped = 0
    for (const m of payload.memories) {
      const { data: existing } = await this.sb.from('me_memories')
        .select('id').eq('content', m.content).eq('user_id', m.userId).limit(1)
      if (existing?.length) { skipped++; continue }
      await this.storeMemory({ userId: m.userId, type: m.type, content: m.content, importance: m.importance as any, sessionId: m.sessionId ?? undefined })
      imported++
    }
    return { imported, skipped }
  }

  async healthStats(userId: string): Promise<HealthStats> {
    const { data: s } = await this.sb.from('me_memory_health_stats')
      .select('*').eq('agent_id', this.agentId).eq('user_id', userId).single()
    const { data: t } = await this.sb.from('me_threads').select('status')
      .eq('agent_id', this.agentId).eq('user_id', userId)
    const { data: p } = await this.sb.from('me_user_profiles').select('profile_key')
      .eq('agent_id', this.agentId).eq('user_id', userId)

    const active  = s?.active_count ?? 0
    const decayed = s?.decayed_count ?? 0
    const total   = active + decayed
    const stale   = s?.stale_count ?? 0
    const open    = (t ?? []).filter((r: any) => r.status !== 'resolved').length

    let score = 100
    if (total > 0 && decayed/total > 0.2) score -= 10
    if (active > 0 && stale/active > 0.3) score -= 15
    if (open > 10) score -= 5
    if ((s?.avg_importance ?? 3) < 2.5) score -= 10

    return {
      totalMemories: total, activeMemories: active, decayedMemories: decayed,
      byType: { episodic: s?.episodic_count??0, semantic: s?.semantic_count??0, preference: s?.preference_count??0, procedural: s?.procedural_count??0 },
      avgImportance: s?.avg_importance ?? 0, avgRelevanceScore: s?.avg_relevance ?? 0,
      staleCount: stale, threadCount: (t??[]).length, openThreadCount: open,
      profileKeyCount: (p??[]).length, oldestMemoryDays: 0,
      healthScore: Math.max(0, score),
    }
  }

  close(): void { /* no-op for Supabase */ }
}
