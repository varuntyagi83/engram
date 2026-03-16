// scripts/summarize-cron.ts
// Weekly session summarization job — generates GPT-4o-mini summaries for ended sessions.
// Run manually: pnpm run cron:summarize
// Schedule via cron: 0 3 * * 0 (03:00 UTC every Sunday)
//
// Usage:
//   pnpm run cron:summarize
//   pnpm run cron:summarize -- --user-id varun

import OpenAI from 'openai'
import { getStorage } from '../src/lib/storage'
import type { StorageAdapter, Session, Memory } from '../src/lib/storage/types'
import { LocalStorage } from '../src/lib/storage/local'

// ── CLI argument parsing ──────────────────────────────────

function parseArgs(): { userId: string | null } {
  const args = process.argv.slice(2)
  const idx = args.indexOf('--user-id')
  if (idx !== -1 && args[idx + 1]) {
    return { userId: args[idx + 1] }
  }
  return { userId: null }
}

// ── User ID discovery ─────────────────────────────────────
// When no --user-id is given, enumerate all users that have memories.
// LocalStorage exposes getDistinctUserIds() for this purpose.
// CloudStorage users are enumerated via exportAll of the default user only,
// as there is no interface-level "list all users" method.

function getUserIds(storage: StorageAdapter, explicitUserId: string | null): string[] {
  if (explicitUserId) {
    return [explicitUserId]
  }

  // LocalStorage has getDistinctUserIds() for admin enumeration
  if (storage instanceof LocalStorage) {
    const ids = storage.getDistinctUserIds()
    if (ids.length > 0) return ids
  }

  // Fallback: use the configured default user
  const defaultUser = process.env.MEMORY_ENGINE_USER_ID ?? 'default'
  console.log(`[summarize-cron] No user enumeration available; falling back to user "${defaultUser}"`)
  return [defaultUser]
}

// ── Session filtering ─────────────────────────────────────

function needsSummary(session: Session): boolean {
  return session.endedAt !== null && (session.summary === null || session.summary.trim() === '')
}

// ── GPT-4o-mini summarization ─────────────────────────────

async function summarizeSession(
  openai: OpenAI,
  sessionId: string,
  memories: Memory[],
): Promise<string> {
  const memoryList = memories
    .map((m, i) => `${i + 1}. [${m.type}] ${m.content}`)
    .join('\n')

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: `Summarize this AI conversation session in 2-3 sentences. Focus on decisions made, key facts learned, and tasks started. Be concise and factual.

Session memories:
${memoryList}`,
      },
    ],
    max_tokens: 200,
    temperature: 0.3,
  })

  const summary = response.choices[0]?.message?.content?.trim()
  if (!summary) {
    throw new Error(`GPT-4o-mini returned empty summary for session ${sessionId}`)
  }
  return summary
}

// ── Main ──────────────────────────────────────────────────

async function run() {
  console.log(`[summarize-cron] Starting — ${new Date().toISOString()}`)

  if (!process.env.OPENAI_API_KEY) {
    console.warn('[summarize-cron] OPENAI_API_KEY is not set — skipping summarization')
    process.exit(0)
  }

  const { userId: explicitUserId } = parseArgs()
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const storage: StorageAdapter = getStorage()

  let totalProcessed = 0
  let totalSummarized = 0
  let totalEmpty = 0
  let totalErrors = 0

  try {
    const userIds = getUserIds(storage, explicitUserId)
    console.log(`[summarize-cron] Processing ${userIds.length} user(s): ${userIds.join(', ')}`)

    for (const userId of userIds) {
      console.log(`[summarize-cron] Checking sessions for user "${userId}"`)

      const payload = await storage.exportAll(userId)
      const sessionsToSummarize = payload.sessions.filter(needsSummary)

      console.log(
        `[summarize-cron]   Found ${payload.sessions.length} total sessions, ` +
        `${sessionsToSummarize.length} need summarization`,
      )

      for (const session of sessionsToSummarize) {
        totalProcessed++

        // Fetch memories created during this session
        const sessionMemories: Memory[] = await storage.getMemories(userId, {
          sessionId: session.id,
          includeDecayed: false,
        })

        if (sessionMemories.length === 0) {
          console.log(
            `[summarize-cron]   Session ${session.id}: no memories found — skipping`,
          )
          totalEmpty++
          continue
        }

        try {
          console.log(
            `[summarize-cron]   Session ${session.id}: summarizing ` +
            `${sessionMemories.length} memories...`,
          )

          const summary = await summarizeSession(openai, session.id, sessionMemories)

          // Write summary back to the session record
          await storage.endSession(session.id, summary)

          // Also persist the summary as a procedural memory for future retrieval
          await storage.storeMemory({
            userId,
            type: 'procedural',
            content: 'Session summary: ' + summary,
            importance: 3,
            sessionId: session.id,
          })

          console.log(`[summarize-cron]   Session ${session.id}: summarized — "${summary.slice(0, 80)}..."`)
          totalSummarized++
        } catch (err) {
          console.error(
            `[summarize-cron]   Session ${session.id}: summarization failed — continuing`,
            err,
          )
          totalErrors++
        }
      }
    }
  } finally {
    storage.close()
  }

  console.log(
    `[summarize-cron] Done — ${new Date().toISOString()} | ` +
    `processed: ${totalProcessed}, summarized: ${totalSummarized}, empty: ${totalEmpty}, errors: ${totalErrors}`,
  )
}

run().catch(e => { console.error('[summarize-cron] Fatal error:', e); process.exit(1) })
