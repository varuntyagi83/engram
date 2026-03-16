// src/app/api/memory/inject/route.ts
// GET ?userId=x → { systemPromptBlock: string, tokenCount: number }

import { NextRequest, NextResponse } from 'next/server'
import { getStorage } from '../../../../lib/storage'
import { buildSystemPrompt, estimateTokens } from '../../../../lib/inject'
import { checkRateLimit } from '../../../../lib/rateLimit'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId') ?? process.env.MEMORY_ENGINE_USER_ID ?? 'default'

  if (!checkRateLimit(`inject:${userId}`, 60)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  try {
    const storage = getStorage()

    const [memories, profile, threads] = await Promise.all([
      storage.getMemories(userId, { limit: 15 }),
      storage.getProfile(userId),
      storage.getThreads(userId, ['open', 'in_progress']),
    ])

    const systemPromptBlock = buildSystemPrompt(memories, profile, threads, {
      includeExtractionInstruction: true,
    })

    const tokenCount = estimateTokens(systemPromptBlock)

    return NextResponse.json({ systemPromptBlock, tokenCount })
  } catch (e) {
    console.error('[api/memory/inject GET]', e)
    return NextResponse.json({ error: 'Failed to build system prompt' }, { status: 500 })
  }
}
