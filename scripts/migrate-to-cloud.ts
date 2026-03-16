// scripts/migrate-to-cloud.ts
// One-time migration: copies local SQLite data → Supabase (Pro upgrade).
// Run after setting cloud env vars: pnpm run migrate:cloud

import { LocalStorage } from '../src/lib/storage/local'
import { CloudStorage } from '../src/lib/storage/cloud'
import { join } from 'path'
import { homedir } from 'os'

async function migrate() {
  console.log('[migrate] Reading local SQLite data...')

  const dbPath = process.env.MEMORY_ENGINE_DB_PATH?.replace('~', homedir())
    ?? join(homedir(), '.memory-engine', 'db.sqlite')

  const local = new LocalStorage(dbPath)
  const cloud = new CloudStorage()

  // Get all distinct users via the adapter method (no internal db access)
  const users = local.getDistinctUserIds()
  console.log(`[migrate] Found ${users.length} user(s): ${users.join(', ')}`)

  let totalImported = 0
  let totalSkipped  = 0

  for (const userId of users) {
    console.log(`\n[migrate] Migrating user: ${userId}`)
    const payload = await local.exportAll(userId)

    console.log(`  → ${payload.memories.length} memories`)
    console.log(`  → ${Object.keys(payload.profile).length} profile keys`)
    console.log(`  → ${payload.threads.length} threads`)

    const result = await cloud.importAll(payload)

    // Migrate profile
    if (Object.keys(payload.profile).length > 0) {
      await cloud.upsertProfile(userId, payload.profile)
    }

    // Migrate threads
    for (const t of payload.threads) {
      await cloud.storeThread({
        userId, title: t.title, description: t.description ?? undefined,
        status: t.status, priority: t.priority,
      })
      if (t.status === 'resolved') {
        const threads = await cloud.getThreads(userId, 'resolved')
        const match = threads.find(x => x.title === t.title)
        if (match) await cloud.updateThread(match.id, { status: 'resolved' })
      }
    }

    console.log(`  ✓ imported: ${result.imported}, skipped (duplicates): ${result.skipped}`)
    totalImported += result.imported
    totalSkipped  += result.skipped
  }

  console.log(`\n[migrate] Complete!`)
  console.log(`  Total imported: ${totalImported}`)
  console.log(`  Total skipped:  ${totalSkipped}`)
  console.log(`\n  Set MEMORY_ENGINE_MODE=cloud in your .env.local to use cloud mode.`)

  local.close()
  cloud.close()
}

migrate().catch(e => { console.error('[migrate] Error:', e.message); process.exit(1) })
