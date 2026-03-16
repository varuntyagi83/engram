// src/lib/storage/types.ts
// ============================================================
// Single interface both SQLite and Supabase backends implement.
// Import types from here — never from local.ts or cloud.ts directly.
// ============================================================

export type MemoryType    = 'episodic' | 'semantic' | 'preference' | 'procedural'
export type ThreadStatus  = 'open' | 'in_progress' | 'resolved' | 'snoozed'
export type ThreadPriority = 'low' | 'medium' | 'high' | 'critical'
export type StorageMode   = 'local' | 'cloud'

// ── Inputs ────────────────────────────────────────────────

export interface MemoryInput {
  userId?    : string           // defaults to MEMORY_ENGINE_USER_ID or 'default'
  type       : MemoryType
  content    : string
  importance : 1 | 2 | 3 | 4 | 5
  sessionId? : string
  tags?      : string[]
}

export interface ThreadInput {
  userId?      : string
  title        : string
  description? : string
  status?      : ThreadStatus
  priority?    : ThreadPriority
  sessionId?   : string
}

// ── Outputs ───────────────────────────────────────────────

export interface Memory {
  id             : string
  userId         : string
  type           : MemoryType
  content        : string
  importance     : number
  relevanceScore : number
  sessionId      : string | null
  tags           : string[]
  decayedAt      : string | null
  createdAt      : string
  updatedAt      : string
}

export interface UserProfile {
  [key: string]: string
}

export interface Thread {
  id          : string
  userId      : string
  title       : string
  description : string | null
  status      : ThreadStatus
  priority    : ThreadPriority
  sessionId   : string | null
  resolvedAt  : string | null
  createdAt   : string
  updatedAt   : string
}

export interface Session {
  id           : string
  userId       : string
  summary      : string | null
  messageCount : number
  startedAt    : string
  endedAt      : string | null
}

export interface ExportPayload {
  version    : '1.0'
  exportedAt : string
  userId     : string
  mode       : StorageMode
  profile    : UserProfile
  memories   : Memory[]
  threads    : Thread[]
  sessions   : Session[]
}

export interface GetMemoriesOpts {
  type?           : MemoryType
  limit?          : number
  includeDecayed? : boolean
  sessionId?      : string
}

export interface SearchOpts {
  type?      : MemoryType
  limit?     : number
  threshold? : number   // similarity threshold — cloud only, ignored locally
}

export interface HealthStats {
  totalMemories    : number
  activeMemories   : number
  decayedMemories  : number
  byType           : Record<MemoryType, number>
  avgImportance    : number
  avgRelevanceScore: number
  staleCount       : number
  threadCount      : number
  openThreadCount  : number
  profileKeyCount  : number
  oldestMemoryDays : number
  healthScore      : number   // 0–100 composite
}

// ── The adapter interface ─────────────────────────────────

export interface StorageAdapter {
  readonly mode: StorageMode

  // Memories
  storeMemory(input: MemoryInput): Promise<string>
  getMemories(userId: string, opts?: GetMemoriesOpts): Promise<Memory[]>
  searchMemories(userId: string, query: string, opts?: SearchOpts): Promise<Memory[]>
  deleteMemory(id: string): Promise<void>              // soft-delete
  updateRelevanceScores(userId: string): Promise<number>

  // Profile
  setProfileKey(userId: string, key: string, value: string): Promise<void>
  getProfile(userId: string): Promise<UserProfile>
  upsertProfile(userId: string, updates: Record<string, string>): Promise<void>

  // Threads
  storeThread(input: ThreadInput): Promise<string>
  getThreads(userId: string, status?: ThreadStatus | ThreadStatus[]): Promise<Thread[]>
  updateThread(id: string, updates: Partial<Pick<Thread, 'status' | 'priority' | 'title' | 'description'>>): Promise<void>

  // Sessions
  startSession(userId: string, sessionId: string): Promise<void>
  endSession(sessionId: string, summary?: string): Promise<void>

  // Utilities
  exportAll(userId: string): Promise<ExportPayload>
  importAll(payload: ExportPayload): Promise<{ imported: number; skipped: number }>
  healthStats(userId: string): Promise<HealthStats>
  updateDecayScores(userId?: string): Promise<void>

  // Lifecycle
  close(): void
}

// ── Result type ───────────────────────────────────────────

export type Result<T> =
  | { ok: true;  data: T }
  | { ok: false; error: string }

export const ok  = <T>(data: T): Result<T>  => ({ ok: true, data })
export const err = (error: string): Result<never> => ({ ok: false, error })

// ── Extraction types (used by extract.ts) ─────────────────

export interface ExtractedMemory {
  type       : MemoryType
  content    : string
  importance : 1 | 2 | 3 | 4 | 5
}

export interface ExtractedThread {
  title    : string
  action   : 'add' | 'resolve'
  priority?: ThreadPriority
}

export interface ExtractResult {
  memories : ExtractedMemory[]
  profile  : Record<string, string>
  threads  : ExtractedThread[]
}
