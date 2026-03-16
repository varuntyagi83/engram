// src/app/api/memory/chat/route.ts
// POST body: { userId, message, conversationHistory: ChatMessage[], sessionId? }
// → Fetches top 15 memories for userId
// → Builds system prompt with buildSystemPrompt()
// → Calls OpenAI gpt-4o with messages (system prompt + conversationHistory + new message)
// → Extracts memories from response async (fire-and-forget)
// → Returns { reply: string (MEMORIES_JSON stripped), memoriesExtracted: number, sessionId: string }

import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { getStorage } from '../../../../lib/storage'
import { buildSystemPrompt } from '../../../../lib/inject'
import { extractFromResponse, stripMemoriesBlock } from '../../../../lib/extract'
import { checkRateLimit } from '../../../../lib/rateLimit'

interface ChatMessage {
  role    : 'system' | 'user' | 'assistant'
  content : string
}

interface ChatPostBody {
  userId              : string
  message             : string
  conversationHistory : ChatMessage[]
  sessionId?          : string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: ChatPostBody

  try {
    body = (await req.json()) as ChatPostBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { message, conversationHistory, userId: rawUserId } = body
  const userId    = rawUserId ?? process.env.MEMORY_ENGINE_USER_ID ?? 'default'
  const sessionId = body.sessionId
    ?? `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  if (!checkRateLimit(`chat:${userId}`, 20)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  if (!message || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'Missing required field: message' }, { status: 400 })
  }

  if (!Array.isArray(conversationHistory)) {
    return NextResponse.json({ error: 'conversationHistory must be an array' }, { status: 400 })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 })
  }

  try {
    const storage = getStorage()

    // Fetch top 15 memories + profile + open threads for system prompt
    const [baseMemories, profile, threads] = await Promise.all([
      storage.getMemories(userId, { limit: 15 }),
      storage.getProfile(userId),
      storage.getThreads(userId, ['open', 'in_progress']),
    ])

    // Proactive surfacing: search for memories semantically relevant to the current message.
    // Skip FTS5 search if the message is too short (< 3 chars) to avoid FTS5 parse errors.
    let memories = baseMemories
    if (message.length >= 3) {
      try {
        const proactiveMemories = await storage.searchMemories(userId, message, { limit: 5 })
        // Merge and deduplicate by id, then cap at 20 total
        const seen = new Set(baseMemories.map(m => m.id))
        const merged = [...baseMemories]
        for (const m of proactiveMemories) {
          if (!seen.has(m.id)) {
            seen.add(m.id)
            merged.push(m)
          }
        }
        memories = merged.slice(0, 20)
      } catch (e) {
        console.warn('[chat] proactive memory search failed, using base memories:', e)
      }
    }

    const systemPromptBlock = buildSystemPrompt(memories, profile, threads, {
      includeExtractionInstruction: true,
    })

    // Validate conversationHistory items before sending to OpenAI
    const validRoles = ['user', 'assistant', 'system']
    const validHistory = (conversationHistory ?? []).filter(
      (m: any) => validRoles.includes(m?.role) && typeof m?.content === 'string' && m.content.length > 0
    )

    // Build messages array: system + history + new user message
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPromptBlock },
      ...validHistory.map(m => ({
        role    : m.role as 'system' | 'user' | 'assistant',
        content : m.content,
      })),
      { role: 'user', content: message },
    ]

    const openai = new OpenAI({ apiKey })
    const completion = await openai.chat.completions.create({
      model      : 'gpt-4o',
      messages,
      temperature: 0.7,
    })

    const rawReply = completion.choices[0]?.message?.content ?? ''
    const reply    = stripMemoriesBlock(rawReply)

    // Await extraction so we can report the actual count of memories stored
    let memoriesExtracted = 0
    try {
      const extracted = await extractFromResponse(rawReply)

      for (const m of extracted.memories) {
        if (!m.content || m.content.length < 8) continue
        await storage.storeMemory({
          userId,
          type       : m.type,
          content    : m.content,
          importance : m.importance,
          sessionId,
        })
        memoriesExtracted++
      }

      if (Object.keys(extracted.profile).length > 0) {
        await storage.upsertProfile(userId, extracted.profile)
      }

      for (const t of extracted.threads) {
        if (!t.title) continue
        await storage.storeThread({
          userId,
          title    : t.title,
          status   : t.action === 'resolve' ? 'resolved' : 'open',
          priority : t.priority ?? 'medium',
          sessionId,
        })
      }
    } catch (e) {
      console.error('[chat] extraction failed:', e)
      memoriesExtracted = 0
    }

    return NextResponse.json({
      reply,
      memoriesExtracted,
      sessionId,
    })
  } catch (e) {
    console.error('[api/memory/chat POST]', e)
    return NextResponse.json({ error: 'Chat request failed' }, { status: 500 })
  }
}
