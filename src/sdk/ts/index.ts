// src/sdk/ts/index.ts
// The Memory Engine SDK — npm package entry point.
//
// Works with ANY LLM (OpenAI, Gemini, Mistral, Ollama, etc.)
// Default mode: local SQLite, zero cloud deps, one API key (OpenAI).
//
// Usage:
//   const me = new MemoryEngine({ userId: 'varun' })
//   const messages = await me.before(history)        // OpenAI format
//   const system   = await me.getSystemPrompt(base)  // Anthropic format
//   const reply = await callAnyLLM(messages)
//   me.after(reply)  // fire-and-forget, non-blocking

import { getStorage, type Memory, type Thread, type UserProfile, type ExportPayload } from '../../lib/storage'
import { buildSystemPrompt, estimateTokens } from '../../lib/inject'
import { extractFromResponse, stripMemoriesBlock } from '../../lib/extract'

export interface MemoryEngineConfig {
  userId?      : string   // defaults to MEMORY_ENGINE_USER_ID env or 'default'
  apiUrl?      : string   // remote mode: point to deployed API URL
  apiKey?      : string   // remote mode: Bearer token for API
  maxMemories? : number   // max memories injected per call (default: 15)
  sessionId?   : string   // override session ID (auto-generated if omitted)
  debug?       : boolean  // log extraction results to console
}

// OpenAI / most LLM message format
export interface ChatMessage {
  role    : 'system' | 'user' | 'assistant'
  content : string
}

// Anthropic message format (no system role in messages array)
export interface AnthropicMessage {
  role    : 'user' | 'assistant'
  content : string
}

export class MemoryEngine {
  private userId      : string
  private apiUrl      : string | null
  private apiKey      : string | null
  private maxMemories : number
  private sessionId   : string
  private debug       : boolean

  constructor(config: MemoryEngineConfig = {}) {
    this.userId      = config.userId   ?? process.env.MEMORY_ENGINE_USER_ID ?? 'default'
    this.apiUrl      = config.apiUrl   ?? process.env.MEMORY_ENGINE_API_URL ?? null
    this.apiKey      = config.apiKey   ?? process.env.MEMORY_ENGINE_API_KEY ?? null
    this.maxMemories = config.maxMemories ?? 15
    this.debug       = config.debug ?? (process.env.NODE_ENV === 'development')
    this.sessionId   = config.sessionId
      ?? `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  // ── before() — inject for OpenAI-style calls ─────────────
  // Prepends a system message (or extends existing one) with memory context

  async before(messages: ChatMessage[]): Promise<ChatMessage[]> {
    const block = await this._buildContextBlock()
    if (!block) return messages

    const hasSystem = messages.length > 0 && messages[0].role === 'system'
    if (hasSystem) {
      return [
        { ...messages[0], content: `${block}\n\n${messages[0].content}` },
        ...messages.slice(1),
      ]
    }
    return [{ role: 'system', content: block }, ...messages]
  }

  // ── beforeWithContext() — proactive surfacing variant ────
  // Like before(), but also searches memories relevant to currentMessage and
  // merges them into the injected context (deduped, capped at 20 total).
  //
  // In remote mode: forwards currentMessage as ?context= query param so the
  // server can use it for proactive surfacing (ignored if server doesn't support it).
  // Falls back to regular before() on any error.

  async beforeWithContext(messages: ChatMessage[], currentMessage: string): Promise<ChatMessage[]> {
    try {
      const block = await this._buildContextBlockWithContext(currentMessage)
      if (!block) return messages

      const hasSystem = messages.length > 0 && messages[0].role === 'system'
      if (hasSystem) {
        return [
          { ...messages[0], content: `${block}\n\n${messages[0].content}` },
          ...messages.slice(1),
        ]
      }
      return [{ role: 'system', content: block }, ...messages]
    } catch (e) {
      if (this.debug) console.warn('[MemoryEngine] beforeWithContext() fell back to before():', e)
      return this.before(messages)
    }
  }

  // ── getSystemPrompt() — for Anthropic / custom LLM calls ─
  // Returns the full system prompt string to pass as the system parameter

  async getSystemPrompt(existingSystem?: string): Promise<string> {
    const block = await this._buildContextBlock()
    if (!block) return existingSystem ?? ''
    return existingSystem ? `${block}\n\n${existingSystem}` : block
  }

  // ── after() — fire-and-forget extraction ─────────────────
  // Call this right after getting LLM response. Non-blocking.

  after(response: string): void {
    this._extractAndStore(response).catch(e => {
      console.error('[MemoryEngine] after() error — memory may not have been stored:', e)
    })
  }

  // Awaitable version — use when you need confirmation
  async afterAsync(response: string): Promise<{ memoriesStored: number; profileUpdated: number }> {
    return this._extractAndStore(response)
  }

  // Strip the MEMORIES_JSON block before showing response to users
  clean(response: string): string {
    return stripMemoriesBlock(response)
  }

  // ── Direct operations ─────────────────────────────────────

  async storeMemory(
    type: Memory['type'], content: string, importance: 1|2|3|4|5 = 3
  ): Promise<string> {
    return getStorage().storeMemory({
      userId: this.userId, type, content, importance, sessionId: this.sessionId
    })
  }

  async searchMemories(query: string): Promise<Memory[]> {
    return getStorage().searchMemories(this.userId, query)
  }

  async getMemories(opts?: { type?: Memory['type']; limit?: number }): Promise<Memory[]> {
    return getStorage().getMemories(this.userId, { ...opts, limit: opts?.limit ?? 50 })
  }

  async getProfile(): Promise<UserProfile> {
    return getStorage().getProfile(this.userId)
  }

  async getThreads(): Promise<Thread[]> {
    return getStorage().getThreads(this.userId, ['open', 'in_progress', 'snoozed'])
  }

  async exportMemories(format: 'json' | 'markdown' | 'cursor-rules' = 'json'): Promise<string> {
    const payload = await getStorage().exportAll(this.userId)
    if (format === 'json')          return JSON.stringify(payload, null, 2)
    if (format === 'cursor-rules')  return this._toCursorRules(payload)
    return this._toMarkdown(payload)
  }

  async healthStats() {
    return getStorage().healthStats(this.userId)
  }

  getSessionId(): string { return this.sessionId }
  newSession(): void {
    this.sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  // ── Internal ──────────────────────────────────────────────

  private async _buildContextBlock(): Promise<string | null> {
    // Remote API mode
    if (this.apiUrl) {
      try {
        const res = await fetch(`${this.apiUrl}/api/memory/inject?userId=${encodeURIComponent(this.userId)}`, {
          headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}
        })
        if (!res.ok) return null
        const data = await res.json() as { systemPromptBlock?: string }
        return data.systemPromptBlock ?? null
      } catch { return null }
    }

    // Local mode — direct SQLite
    const storage = getStorage()
    const [memories, profile, threads] = await Promise.all([
      storage.getMemories(this.userId, { limit: this.maxMemories }),
      storage.getProfile(this.userId),
      storage.getThreads(this.userId, ['open', 'in_progress']),
    ])
    if (!memories.length && !Object.keys(profile).length) return null

    const block = buildSystemPrompt(memories, profile, threads)
    if (this.debug) console.log(`[MemoryEngine] injecting ~${estimateTokens(block)} tokens`)
    return block
  }

  private async _buildContextBlockWithContext(currentMessage: string): Promise<string | null> {
    // Remote API mode — forward currentMessage as ?context= so future server
    // versions can use it for proactive surfacing; falls back gracefully today.
    if (this.apiUrl) {
      try {
        const url = `${this.apiUrl}/api/memory/inject?userId=${encodeURIComponent(this.userId)}&context=${encodeURIComponent(currentMessage)}`
        const res = await fetch(url, {
          headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}
        })
        if (!res.ok) return null
        const data = await res.json() as { systemPromptBlock?: string }
        return data.systemPromptBlock ?? null
      } catch { return null }
    }

    // Local mode — fetch base memories + proactive search, then merge
    const storage = getStorage()
    const [baseMemories, profile, threads] = await Promise.all([
      storage.getMemories(this.userId, { limit: this.maxMemories }),
      storage.getProfile(this.userId),
      storage.getThreads(this.userId, ['open', 'in_progress']),
    ])

    let memories = baseMemories

    // Proactive surfacing: skip FTS5 search for very short messages (< 3 chars)
    if (currentMessage.length >= 3) {
      try {
        const proactive = await storage.searchMemories(this.userId, currentMessage, { limit: 5 })
        const seen = new Set(baseMemories.map(m => m.id))
        const merged = [...baseMemories]
        for (const m of proactive) {
          if (!seen.has(m.id)) {
            seen.add(m.id)
            merged.push(m)
          }
        }
        memories = merged.slice(0, 20)
      } catch (e) {
        if (this.debug) console.warn('[MemoryEngine] proactive search failed, using base memories:', e)
      }
    }

    if (!memories.length && !Object.keys(profile).length) return null

    const block = buildSystemPrompt(memories, profile, threads)
    if (this.debug) console.log(`[MemoryEngine] injecting ~${estimateTokens(block)} tokens (with proactive context)`)
    return block
  }

  private async _extractAndStore(
    response: string
  ): Promise<{ memoriesStored: number; profileUpdated: number }> {
    const extracted = await extractFromResponse(response)
    if (this.debug) console.log('[MemoryEngine] extracted:', extracted)

    const storage = getStorage()
    let memoriesStored = 0
    let profileUpdated = 0

    // Batch dedup: fetch existing memories once (O(1) query) instead of N searchMemories calls
    const allExisting = await storage.getMemories(this.userId, { limit: 500 })
    const existingContents = allExisting.map(m => m.content.toLowerCase())

    for (const m of extracted.memories) {
      if (!m.content || m.content.length < 8) continue
      const prefixLow = m.content.toLowerCase().slice(0, 80)
      const isDuplicate = existingContents.some(c => c.includes(prefixLow))
      if (isDuplicate) {
        if (this.debug) console.warn('[MemoryEngine] dedup: discarding near-duplicate memory:', m.content.slice(0, 60))
        continue
      }
      await storage.storeMemory({
        userId: this.userId, type: m.type, content: m.content,
        importance: m.importance, sessionId: this.sessionId,
      })
      memoriesStored++
      existingContents.push(m.content.toLowerCase()) // prevent duplicates within the same batch
    }

    if (Object.keys(extracted.profile).length > 0) {
      await storage.upsertProfile(this.userId, extracted.profile)
      profileUpdated = Object.keys(extracted.profile).length
    }

    for (const t of extracted.threads) {
      if (!t.title) continue
      await storage.storeThread({
        userId: this.userId, title: t.title,
        status: t.action === 'resolve' ? 'resolved' : 'open',
        priority: t.priority ?? 'medium', sessionId: this.sessionId,
      })
    }

    return { memoriesStored, profileUpdated }
  }

  private _toMarkdown(p: ExportPayload): string {
    const lines = [
      `# Memory Export — ${p.userId}`,
      `Generated: ${p.exportedAt} | Mode: ${p.mode}`, '',
      `## Profile`,
      ...Object.entries(p.profile).map(([k, v]) => `- **${k}**: ${v}`), '',
      `## Memories (${p.memories.length})`,
    ]
    for (const type of ['procedural','semantic','preference','episodic']) {
      const group = p.memories.filter(m => m.type === type)
      if (!group.length) continue
      lines.push('', `### ${type.charAt(0).toUpperCase() + type.slice(1)}`)
      group.forEach(m => lines.push(`- [${m.importance}★] ${m.content}`))
    }
    const open = p.threads.filter(t => t.status !== 'resolved')
    if (open.length) {
      lines.push('', '## Open threads')
      open.forEach(t => lines.push(`- [${t.priority.toUpperCase()}] ${t.title}`))
    }
    return lines.join('\n')
  }

  private _toCursorRules(p: ExportPayload): string {
    // Cursor Rules / .cursor/memory.md format
    // Filtered to importance >= 3, max ~2000 tokens
    const important = p.memories.filter(m => m.importance >= 3)
    const lines = [
      `# Memory Engine Context`,
      `Generated: ${p.exportedAt} | Memories: ${important.length}`, '',
    ]
    if (Object.keys(p.profile).length) {
      lines.push('## User profile', ...Object.entries(p.profile).map(([k, v]) => `- ${k}: ${v}`), '')
    }
    const procs = important.filter(m => m.type === 'procedural')
    const sems  = important.filter(m => m.type === 'semantic')
    const prefs = important.filter(m => m.type === 'preference')
    if (procs.length) { lines.push('## Decisions & workflows'); procs.forEach(m => lines.push(`- ${m.content}`)); lines.push('') }
    if (sems.length)  { lines.push('## Key facts');             sems.forEach(m =>  lines.push(`- ${m.content}`)); lines.push('') }
    if (prefs.length) { lines.push('## Preferences');           prefs.forEach(m => lines.push(`- ${m.content}`)); lines.push('') }
    const open = p.threads.filter(t => t.status !== 'resolved')
    if (open.length) { lines.push('## Open tasks'); open.forEach(t => lines.push(`- [ ] [${t.priority.toUpperCase()}] ${t.title}`)) }
    return lines.join('\n')
  }
}

export default MemoryEngine
export type { Memory, Thread, UserProfile, ExportPayload } from '../../lib/storage'
