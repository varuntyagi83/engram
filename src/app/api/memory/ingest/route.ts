// src/app/api/memory/ingest/route.ts
// POST /api/memory/ingest
//
// Webhook receiver for Slack and GitHub events. Extracts a memory string from
// each event payload and stores it via the storage adapter.
//
// NOTE: Webhook signature verification (HMAC-SHA256) is intentionally omitted.
// This is a single-user, self-hosted tool and the endpoint is not exposed
// publicly by default. If you plan to expose this endpoint on the public
// internet, add HMAC verification using the signing secret provided by Slack
// (X-Slack-Signature) or GitHub (X-Hub-Signature-256) before deploying.

import { NextRequest, NextResponse } from 'next/server'
import { getStorage } from '../../../lib/storage'
import type { MemoryType } from '../../../lib/storage'
import { checkRateLimit } from '../../../lib/rateLimit'

// ── Request shape ─────────────────────────────────────────

type IngestSource = 'slack' | 'github'

interface IngestBody {
  source  : IngestSource
  userId? : string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event   : Record<string, any>
}

// ── Extracted content ─────────────────────────────────────

interface ExtractedContent {
  content    : string
  type       : MemoryType
  importance : 1 | 2 | 3 | 4 | 5
}

// ── Slack extraction ──────────────────────────────────────

function extractSlack(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: Record<string, any>
): ExtractedContent | null {
  // Skip bot-generated messages — bots set bot_id on the event envelope or
  // on the nested message object for message_changed events.
  if (event.bot_id) return null

  const text = event.text ?? event.message?.text
  const user = event.user ?? event.message?.user

  if (!text) return null

  const truncated = String(text).slice(0, 500)
  const actor     = user ? String(user) : 'unknown'

  return {
    content    : `Slack message from ${actor}: ${truncated}`,
    type       : 'episodic',
    importance : 2,
  }
}

// ── GitHub extraction ─────────────────────────────────────

function extractGitHub(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: Record<string, any>
): ExtractedContent | null {
  const action = event.action ? String(event.action) : undefined

  // Pull request events
  if (event.pull_request) {
    const pr     = event.pull_request
    const title  = pr.title  ? String(pr.title)  : 'untitled'
    const author = pr.user?.login
      ?? event.sender?.login
      ?? 'unknown'
    const act    = action ?? 'updated'

    return {
      content    : `GitHub PR ${act}: ${title} by ${author}`,
      type       : 'procedural',
      importance : 3,
    }
  }

  // Issue events
  if (event.issue) {
    const issue  = event.issue
    const title  = issue.title ? String(issue.title) : 'untitled'
    const author = issue.user?.login
      ?? event.sender?.login
      ?? 'unknown'
    const act    = action ?? 'updated'

    return {
      content    : `GitHub issue ${act}: ${title} by ${author}`,
      type       : 'procedural',
      importance : 2,
    }
  }

  // Push events
  if (event.commits !== undefined || event.pusher !== undefined) {
    const ref    = event.ref ? String(event.ref) : 'unknown ref'
    const author = event.pusher?.name
      ?? event.sender?.login
      ?? 'unknown'

    const firstCommit = Array.isArray(event.commits) ? event.commits[0] : undefined
    const message     = firstCommit?.message
      ? String(firstCommit.message).split('\n')[0].trim()
      : 'no commit message'

    return {
      content    : `GitHub push to ${ref} by ${author}: ${message}`,
      type       : 'episodic',
      importance : 2,
    }
  }

  return null
}

// ── Route handler ─────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: IngestBody

  try {
    body = (await req.json()) as IngestBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { source, event, userId: rawUserId } = body
  const userId = rawUserId ?? process.env.MEMORY_ENGINE_USER_ID ?? 'default'

  // Source validation
  if (source !== 'slack' && source !== 'github') {
    return NextResponse.json(
      { error: 'Invalid source. Must be slack or github' },
      { status: 400 }
    )
  }

  // Event must be an object
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return NextResponse.json(
      { error: 'Missing or invalid event payload' },
      { status: 400 }
    )
  }

  // Rate limiting: 120 ingest calls per minute per userId
  if (!checkRateLimit(`ingest:${userId}`, 120)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  // Bot-message skip for Slack (must return 200 so Slack does not retry)
  if (source === 'slack' && event.bot_id) {
    return NextResponse.json({ skipped: true })
  }

  // Extract content from the event
  const extracted =
    source === 'slack'
      ? extractSlack(event)
      : extractGitHub(event)

  if (!extracted) {
    return NextResponse.json(
      { skipped: true, reason: 'No extractable content' },
      { status: 200 }
    )
  }

  // Store the memory
  try {
    const storage = getStorage()
    const id = await storage.storeMemory({
      userId,
      type       : extracted.type,
      content    : extracted.content,
      importance : extracted.importance,
      tags       : [source],
    })

    return NextResponse.json(
      { stored: true, id, source, userId },
      { status: 201 }
    )
  } catch (e) {
    console.error('[api/memory/ingest POST]', e)
    return NextResponse.json({ error: 'Failed to store memory' }, { status: 500 })
  }
}
