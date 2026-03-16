// src/app/api/memory/health/route.ts
// GET  ?userId=x → HealthStats JSON
// POST ?userId=x → triggers decay scoring run

import { NextRequest, NextResponse } from 'next/server'
import { getStorage } from '../../../../lib/storage'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId') ?? process.env.MEMORY_ENGINE_USER_ID ?? 'default'

  try {
    const storage = getStorage()
    const stats = await storage.healthStats(userId)
    return NextResponse.json(stats)
  } catch (e) {
    console.error('[api/memory/health GET]', e)
    return NextResponse.json({ error: 'Failed to fetch health stats' }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // userId may come from query string or JSON body (page.tsx sends it in body)
  const { searchParams } = new URL(req.url)
  let userId = searchParams.get('userId')
  if (!userId) {
    try { const b = await req.json(); userId = b?.userId ?? null } catch { /* no body */ }
  }
  userId = userId ?? process.env.MEMORY_ENGINE_USER_ID ?? 'default'

  try {
    const storage = getStorage()
    await storage.updateDecayScores(userId)
    return NextResponse.json({ success: true, userId })
  } catch (e) {
    console.error('[api/memory/health POST]', e)
    return NextResponse.json({ error: 'Decay run failed' }, { status: 500 })
  }
}
