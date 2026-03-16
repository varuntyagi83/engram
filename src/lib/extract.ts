// src/lib/extract.ts
// Memory extraction from LLM responses.
//
// Two-path approach:
//   Path A (free, $0):   Parse MEMORIES_JSON block embedded in LLM response
//   Path B (~$0.0003):   Call gpt-4o-mini when no block found
//
// Path A is the default — the system prompt instructs the main LLM
// to append MEMORIES_JSON at the end of every response.
// Path B only fires as a fallback.

import OpenAI from 'openai'
import type { ExtractResult, ExtractedMemory, ExtractedThread, MemoryType, ThreadPriority } from './storage/types'

const MARKER = 'MEMORIES_JSON:'

// ── Path A: parse embedded block ──────────────────────────

function parseBlock(text: string): ExtractResult | null {
  const idx = text.indexOf(MARKER)
  if (idx === -1) return null

  const jsonStr = text.substring(idx + MARKER.length).trim()
  try {
    const raw = JSON.parse(jsonStr)
    return {
      memories: (raw.memories ?? []).map((m: any) => ({
        type: validateMemoryType(m.type),
        content: String(m.content ?? '').trim(),
        importance: clampImportance(m.importance),
      })).filter((m: any) => m.content.length >= 8),
      profile: sanitizeProfile(raw.profile ?? {}),
      threads: (raw.threads ?? []).map((t: any) => ({
        title: String(t.title ?? '').trim(),
        action: t.action === 'resolve' ? 'resolve' : 'add',
        priority: validatePriority(t.priority),
      })).filter((t: any) => t.title.length > 0),
    }
  } catch (e) { console.warn('[extract] parseBlock: malformed MEMORIES_JSON, falling back to LLM extraction:', e); return null }
}

// ── Path B: gpt-4o-mini extraction fallback ───────────────

async function extractViaLLM(text: string): Promise<ExtractResult> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [{
      role: 'system',
      content: `Extract memories from the AI response text. Return ONLY valid JSON, no other text.
Output format:
{
  "memories": [{"type": "episodic|semantic|preference|procedural", "content": "concise fact", "importance": 1-5}],
  "profile": {"key": "value"},
  "threads": [{"title": "task title", "action": "add|resolve", "priority": "low|medium|high|critical"}]
}

Memory types:
- episodic: what happened in this conversation
- semantic: facts, knowledge, beliefs the user has
- preference: how they like things done
- procedural: decisions made, workflows, processes

Importance: 5=critical, 4=high, 3=medium, 2=low, 1=trivial
Profile: flat key-value facts about the user (name, role, location, tools, goals)
Threads: tasks or open questions to track across sessions

Only extract genuinely new, useful information. If nothing worth storing, return empty arrays.`,
    }, {
      role: 'user',
      content: `Extract memories from this response:\n\n${text.slice(0, 3000)}`,
    }],
  })

  if (!response.choices?.[0]) {
    console.warn('[extract] extractViaLLM: OpenAI returned empty choices array');
  }
  const raw = JSON.parse(response.choices?.[0]?.message?.content ?? '{}')
  return {
    memories: (raw.memories ?? []).map((m: any) => ({
      type: validateMemoryType(m.type),
      content: String(m.content ?? '').trim(),
      importance: clampImportance(m.importance),
    })).filter((m: any) => m.content.length >= 8),
    profile: sanitizeProfile(raw.profile ?? {}),
    threads: (raw.threads ?? []).map((t: any) => ({
      title: String(t.title ?? '').trim(),
      action: t.action === 'resolve' ? 'resolve' : 'add',
      priority: validatePriority(t.priority),
    })).filter((t: any) => t.title.length > 0),
  }
}

// ── Main export ───────────────────────────────────────────

export async function extractFromResponse(text: string): Promise<ExtractResult> {
  // Try Path A first — free, instant
  const parsed = parseBlock(text)
  if (parsed) return parsed

  // Path B — only if OPENAI_API_KEY is set, else return empty
  if (!process.env.OPENAI_API_KEY) {
    return { memories: [], profile: {}, threads: [] }
  }

  try {
    return await extractViaLLM(text)
  } catch (e) {
    console.warn('[memory-engine] extraction fallback failed:', (e as Error).message)
    return { memories: [], profile: {}, threads: [] }
  }
}

// Strips the MEMORIES_JSON block from text before showing to user
export function stripMemoriesBlock(text: string): string {
  const idx = text.indexOf(MARKER)
  return idx === -1 ? text : text.substring(0, idx).trim()
}

// ── The system prompt instruction (append to any LLM prompt) ──

export const EXTRACTION_INSTRUCTION = `
After EVERY response, append a MEMORIES_JSON block like this (no markdown, no fences):
MEMORIES_JSON:{"memories":[{"type":"episodic|semantic|preference|procedural","content":"concise fact","importance":1-5}],"profile":{"key":"value"},"threads":[{"title":"task","action":"add|resolve","priority":"low|medium|high|critical"}]}

Rules:
- Only extract NEW information not already in memory
- episodic = what happened, semantic = facts/beliefs, preference = how they like things, procedural = decisions
- importance: 5=critical, 4=high, 3=medium, 2=low, 1=trivial
- threads: add new open tasks, resolve completed ones
- If nothing new: MEMORIES_JSON:{"memories":[],"profile":{},"threads":[]}
- ALWAYS include the block, every single response`.trim()

// ── Helpers ───────────────────────────────────────────────

function validateMemoryType(t: any): MemoryType {
  return ['episodic','semantic','preference','procedural'].includes(t) ? t : 'episodic'
}

function validatePriority(p: any): ThreadPriority {
  return ['low','medium','high','critical'].includes(p) ? p : 'medium'
}

function clampImportance(v: any): 1|2|3|4|5 {
  const n = parseInt(v) || 3
  if (n < 1 || n > 5) {
    console.warn(`[extract] importance value ${n} is out of range [1,5], clamping`);
  }
  return Math.min(5, Math.max(1, n)) as 1|2|3|4|5
}

function sanitizeProfile(raw: any): Record<string,string> {
  if (typeof raw !== 'object' || !raw) return {}
  return Object.fromEntries(
    Object.entries(raw)
      .filter(([k, v]) => typeof k === 'string' && typeof v === 'string' && k.length > 0 && (v as string).length > 0)
      .map(([k, v]) => {
        const key = k.toLowerCase().replace(/\s+/g, '_')
        let val = v as string
        if (val.length > 500) {
          console.warn(`[extract] profile value for key "${key}" truncated from ${val.length} to 500 chars`)
          val = val.slice(0, 500)
        }
        return [key, val]
      })
  )
}
