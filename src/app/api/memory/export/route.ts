// src/app/api/memory/export/route.ts
// GET ?userId=x&format=json|markdown|cursor-rules → file download

import { NextRequest, NextResponse } from 'next/server'
import { getStorage } from '../../../../lib/storage'
import type { ExportPayload, Memory, Thread } from '../../../../lib/storage'

type ExportFormat = 'json' | 'markdown' | 'cursor-rules'

function toMarkdown(p: ExportPayload): string {
  const lines: string[] = [
    `# Memory Export — ${p.userId}`,
    `Generated: ${p.exportedAt} | Mode: ${p.mode}`,
    '',
    `## Profile`,
    ...Object.entries(p.profile).map(([k, v]) => `- **${k}**: ${v}`),
    '',
    `## Memories (${p.memories.length})`,
  ]
  for (const type of ['procedural', 'semantic', 'preference', 'episodic'] as const) {
    const group: Memory[] = p.memories.filter(m => m.type === type)
    if (!group.length) continue
    lines.push('', `### ${type.charAt(0).toUpperCase() + type.slice(1)}`)
    group.forEach(m => lines.push(`- [${m.importance}★] ${m.content}`))
  }
  const open: Thread[] = p.threads.filter(t => t.status !== 'resolved')
  if (open.length) {
    lines.push('', '## Open threads')
    open.forEach(t => lines.push(`- [${t.priority.toUpperCase()}] ${t.title}`))
  }
  return lines.join('\n')
}

function toCursorRules(p: ExportPayload): string {
  const important: Memory[] = p.memories.filter(m => m.importance >= 3)
  const lines: string[] = [
    `# Memory Engine Context`,
    `Generated: ${p.exportedAt} | Memories: ${important.length}`,
    '',
  ]
  if (Object.keys(p.profile).length) {
    lines.push('## User profile', ...Object.entries(p.profile).map(([k, v]) => `- ${k}: ${v}`), '')
  }
  const procs = important.filter(m => m.type === 'procedural')
  const sems  = important.filter(m => m.type === 'semantic')
  const prefs = important.filter(m => m.type === 'preference')
  if (procs.length) {
    lines.push('## Decisions & workflows')
    procs.forEach(m => lines.push(`- ${m.content}`))
    lines.push('')
  }
  if (sems.length) {
    lines.push('## Key facts')
    sems.forEach(m => lines.push(`- ${m.content}`))
    lines.push('')
  }
  if (prefs.length) {
    lines.push('## Preferences')
    prefs.forEach(m => lines.push(`- ${m.content}`))
    lines.push('')
  }
  const open: Thread[] = p.threads.filter(t => t.status !== 'resolved')
  if (open.length) {
    lines.push('## Open tasks')
    open.forEach(t => lines.push(`- [ ] [${t.priority.toUpperCase()}] ${t.title}`))
  }
  return lines.join('\n')
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url)
  const userId    = searchParams.get('userId') ?? process.env.MEMORY_ENGINE_USER_ID ?? 'default'
  const formatRaw = searchParams.get('format') ?? 'json'

  const validFormats: ExportFormat[] = ['json', 'markdown', 'cursor-rules']
  if (!validFormats.includes(formatRaw as ExportFormat)) {
    return NextResponse.json(
      { error: `Invalid format. Must be one of: ${validFormats.join(', ')}` },
      { status: 400 }
    )
  }

  const format = formatRaw as ExportFormat

  try {
    const storage = getStorage()
    const payload = await storage.exportAll(userId)

    if (format === 'json') {
      const body = JSON.stringify(payload, null, 2)
      return new NextResponse(body, {
        status: 200,
        headers: {
          'Content-Type'        : 'application/json',
          'Content-Disposition' : 'attachment; filename="memory-export.json"',
        },
      })
    }

    if (format === 'markdown') {
      const body = toMarkdown(payload)
      return new NextResponse(body, {
        status: 200,
        headers: {
          'Content-Type'        : 'text/markdown; charset=utf-8',
          'Content-Disposition' : 'attachment; filename="memory-export.md"',
        },
      })
    }

    // cursor-rules
    const body = toCursorRules(payload)
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type'        : 'text/plain; charset=utf-8',
        'Content-Disposition' : 'attachment; filename=".cursor-memory.md"',
      },
    })
  } catch (e) {
    console.error('[api/memory/export GET]', e)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
