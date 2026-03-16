// scripts/decay-cron.ts
// Nightly decay job — updates relevance scores and soft-deletes stale memories.
// Run manually: pnpm run cron:decay
// Schedule via cron: 0 2 * * * (02:00 UTC daily)

import { getStorage } from '../src/lib/storage'
import type { StorageAdapter } from '../src/lib/storage/types'

async function run() {
  console.log(`[decay-cron] Starting — ${new Date().toISOString()}`)
  const storage: StorageAdapter = getStorage()

  await storage.updateDecayScores()

  console.log(`[decay-cron] Done — ${new Date().toISOString()}`)
  storage.close()
}

run().catch(e => { console.error('[decay-cron] Error:', e); process.exit(1) })
