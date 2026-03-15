// scripts/decay-cron.ts
// Nightly decay job — updates relevance scores and soft-deletes stale memories.
// Run manually: pnpm run cron:decay
// Schedule via cron: 0 2 * * * (02:00 UTC daily)

import { getStorage, resetStorage } from '../src/lib/storage'

async function run() {
  console.log(`[decay-cron] Starting — ${new Date().toISOString()}`)
  const storage = getStorage()

  // Get distinct user IDs
  // For local: query SQLite directly; for cloud: query Supabase
  const users = await getDistinctUsers(storage)
  console.log(`[decay-cron] Processing ${users.length} user(s)`)

  let totalUpdated = 0
  for (const userId of users) {
    const updated = await storage.updateRelevanceScores(userId)
    totalUpdated += updated
    if (updated > 0) console.log(`  ${userId}: ${updated} memories updated`)
  }

  console.log(`[decay-cron] Done — ${totalUpdated} total memories updated`)
  storage.close()
}

async function getDistinctUsers(storage: any): Promise<string[]> {
  // Access DB internals to get user list — acceptable in a cron script
  if (storage.mode === 'local' && storage.db) {
    const rows = storage.db.prepare(`SELECT DISTINCT user_id FROM memories WHERE decayed_at IS NULL`).all() as any[]
    return rows.map(r => r.user_id)
  }
  if (storage.mode === 'cloud') {
    const { data } = await storage.sb.from('me_memories').select('user_id').is('decayed_at', null)
    return [...new Set((data ?? []).map((r: any) => r.user_id))] as string[]
  }
  return []
}

run().catch(e => { console.error('[decay-cron] Error:', e); process.exit(1) })
