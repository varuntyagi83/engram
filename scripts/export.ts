// scripts/export.ts
// CLI export tool — exports memories to JSON, Markdown, or Cursor Rules format.
//
// Usage:
//   pnpm run export
//   pnpm run export -- --user-id varun --format markdown --output ./memories.md
//   pnpm run export -- --format cursor-rules --output .cursor/memory.md

import { getStorage } from '../src/lib/storage'
import type { ExportPayload } from '../src/lib/storage'
import * as fs from 'fs'
import * as path from 'path'

// ── Arg parsing ────────────────────────────────────────────────────────────────

type Format = 'json' | 'markdown' | 'cursor-rules'

interface CliOptions {
  userId : string
  format : Format
  output : string | null
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    userId : process.env.MEMORY_ENGINE_USER_ID ?? 'default',
    format : 'json',
    output : null,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = argv[i + 1]

    if (arg === '--user-id' && next) {
      opts.userId = next
      i++
    } else if (arg === '--format' && next) {
      if (next === 'json' || next === 'markdown' || next === 'cursor-rules') {
        opts.format = next
      } else {
        console.error(`[export] Unknown format "${next}". Use: json | markdown | cursor-rules`)
        process.exit(1)
      }
      i++
    } else if (arg === '--output' && next) {
      opts.output = next
      i++
    } else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
  }

  return opts
}

function printHelp(): void {
  console.log(`
memory-engine export — export memories to file or stdout

Usage:
  pnpm run export [options]

Options:
  --user-id <id>              User ID (default: MEMORY_ENGINE_USER_ID env or "default")
  --format json|markdown|cursor-rules
                              Output format (default: json)
  --output <filepath>         Write to file instead of stdout
  --help, -h                  Show this help

Examples:
  pnpm run export -- --format json
  pnpm run export -- --user-id varun --format markdown --output ./memories.md
  pnpm run export -- --format cursor-rules --output .cursor/memory.md
`.trim())
}

// ── Formatters — logic mirrored from src/sdk/ts/index.ts ──────────────────────

function toMarkdown(p: ExportPayload): string {
  const lines = [
    `# Memory Export — ${p.userId}`,
    `Generated: ${p.exportedAt} | Mode: ${p.mode}`, '',
    `## Profile`,
    ...Object.entries(p.profile).map(([k, v]) => `- **${k}**: ${v}`), '',
    `## Memories (${p.memories.length})`,
  ]
  for (const type of ['procedural', 'semantic', 'preference', 'episodic']) {
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

function toCursorRules(p: ExportPayload): string {
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

function formatPayload(payload: ExportPayload, format: Format): string {
  if (format === 'json')         return JSON.stringify(payload, null, 2)
  if (format === 'cursor-rules') return toCursorRules(payload)
  return toMarkdown(payload)
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))

  const storage = getStorage()

  try {
    const payload = await storage.exportAll(opts.userId)
    const output  = formatPayload(payload, opts.format)

    if (opts.output) {
      const resolved = path.resolve(opts.output)
      const dir      = path.dirname(resolved)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(resolved, output, 'utf8')
      console.error(`[export] Wrote ${opts.format} export to ${resolved}`)
      console.error(`[export] ${payload.memories.length} memories, ${payload.threads.length} threads, ${Object.keys(payload.profile).length} profile keys`)
    } else {
      process.stdout.write(output + '\n')
    }
  } finally {
    storage.close()
  }
}

main().catch(err => {
  console.error('[export] Fatal:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
