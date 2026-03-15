// scripts/init.ts
// Run automatically via postinstall.
// Creates ~/.memory-engine/db.sqlite and applies schema.

import { mkdirSync, existsSync, writeFileSync } from 'fs'
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
    const Database = require('better-sqlite3')
    const { readFileSync } = require('fs')
    const { join: pjoin, existsSync: pExists } = require('path')

    const db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    const schemaPaths = [
      pjoin(process.cwd(), 'database', 'local-schema.sql'),
      pjoin(__dirname, '../database/local-schema.sql'),
    ]
    for (const p of schemaPaths) {
      if (pExists(p)) { db.exec(readFileSync(p, 'utf-8')); break }
    }
    db.close()

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
