// src/app/api/memory/route.ts
// GET  ?userId=x&type=x&limit=x  → Memory[]
// POST body: { userId, type, content, importance } → { id }
// DELETE ?id=x → { success: true }

import { NextRequest, NextResponse } from 'next/server'
import { getStorage } from '../../../lib/storage'
import type { MemoryType } from '../../../lib/storage'
import { checkRateLimit } from '../../../lib/rateLimit'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId') ?? process.env.MEMORY_ENGINE_USER_ID ?? 'default'
  const type   = searchParams.get('type') as MemoryType | null
  const limit  = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 50

  const validTypes: MemoryType[] = ['episodic', 'semantic', 'preference', 'procedural']
  if (type !== null && !validTypes.includes(type)) {
    return NextResponse.json(
      { error: `Invalid type. Must be one of: ${validTypes.join(', ')}` },
      { status: 400 }
    )
  }

  try {
    const storage = getStorage()
    const memories = await storage.getMemories(userId, {
      type:  type ?? undefined,
      limit: isNaN(limit) ? 50 : limit,
    })
    return NextResponse.json(memories)
  } catch (e) {
    console.error('[api/memory GET]', e)
    return NextResponse.json({ error: 'Failed to fetch memories' }, { status: 500 })
  }
}

interface MemoryPostBody {
  userId?    : string
  type       : MemoryType
  content    : string
  importance : 1 | 2 | 3 | 4 | 5
  sessionId? : string
  tags?      : string[]
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: MemoryPostBody

  try {
    body = (await req.json()) as MemoryPostBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { type, content, importance, userId: rawUserId, sessionId, tags } = body
  const userId = rawUserId ?? process.env.MEMORY_ENGINE_USER_ID ?? 'default'

  if (!checkRateLimit(`write:${userId}`, 60)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  if (!type || !content || importance === undefined) {
    return NextResponse.json(
      { error: 'Missing required fields: type, content, importance' },
      { status: 400 }
    )
  }

  const validTypes: MemoryType[] = ['episodic', 'semantic', 'preference', 'procedural']
  if (!validTypes.includes(type)) {
    return NextResponse.json(
      { error: `Invalid type. Must be one of: ${validTypes.join(', ')}` },
      { status: 400 }
    )
  }

  if (![1, 2, 3, 4, 5].includes(importance)) {
    return NextResponse.json({ error: 'importance must be 1–5' }, { status: 400 })
  }

  try {
    const storage = getStorage()
    const id = await storage.storeMemory({
      userId,
      type,
      content,
      importance,
      sessionId,
      tags,
    })
    return NextResponse.json({ id }, { status: 201 })
  } catch (e) {
    console.error('[api/memory POST]', e)
    return NextResponse.json({ error: 'Failed to store memory' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'Missing required query param: id' }, { status: 400 })
  }

  try {
    const storage = getStorage()
    await storage.deleteMemory(id)
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[api/memory DELETE]', e)
    return NextResponse.json({ error: 'Failed to delete memory' }, { status: 500 })
  }
}
