// src/app/api/memory/threads/route.ts
// GET ?userId=x&status=open  → Thread[]

import { NextRequest, NextResponse } from 'next/server'
import { getStorage } from '../../../../lib/storage'
import type { ThreadStatus } from '../../../../lib/storage'

const VALID_STATUSES: ThreadStatus[] = ['open', 'in_progress', 'snoozed', 'resolved']

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId') ?? process.env.MEMORY_ENGINE_USER_ID ?? 'default'
  const statusParam = searchParams.get('status') as ThreadStatus | null

  if (statusParam !== null && !VALID_STATUSES.includes(statusParam)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  try {
    const storage = getStorage()
    const threads = await storage.getThreads(userId, statusParam ?? ['open', 'in_progress'])
    return NextResponse.json(threads)
  } catch (e) {
    console.error('[api/memory/threads GET]', e)
    return NextResponse.json({ error: 'Failed to fetch threads' }, { status: 500 })
  }
}
