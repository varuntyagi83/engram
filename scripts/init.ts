// scripts/init.ts
// Run automatically via postinstall.
// Creates ~/.memory-engine/db.sqlite and applies schema.

import { mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

async function init() {
  const dir = join(homedir(), '.memory-engine')
  mkdirSync(dir, { recursive: true })

  const dbPath = process.env.MEMORY_ENGINE_DB_PATH?.replace('~', homedir())
    ?? join(dir, 'db.sqlite')

  // Only run if DB doesn't exist yet (skip on re-install)
  if (existsSync(dbPath)) return

  try {
    const { LocalStorage } = await import('../src/lib/storage/local')
    const s = new LocalStorage(dbPath)
    await s.close()

    console.log(`✓ Memory Engine initialised`)
    console.log(`  DB: ${dbPath}`)
    console.log(`  Mode: ${process.env.MEMORY_ENGINE_MODE ?? 'local'} (SQLite)`)
    console.log(``)
    console.log(`  Quick start:`)
    console.log(`    pnpm dev          # dashboard at localhost:3000`)
    console.log(`    pnpm run mcp      # MCP server for Cursor + Claude Code`)
  } catch (e) {
    // Silent fail during CI or environments without better-sqlite3
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[memory-engine] init skipped:', (e as Error).message)
    }
  }
}

init().catch(() => {})
