// src/lib/inject.ts
// Builds the memory context block injected into every LLM system prompt.
// Keeps token count under 2000 by default.

import type { Memory, UserProfile, Thread } from './storage/types'
import { EXTRACTION_INSTRUCTION } from './extract'

const MAX_TOKENS = 2000
const CHARS_PER_TOKEN = 4  // rough estimate

export function buildSystemPrompt(
  memories: Memory[],
  profile: UserProfile,
  threads: Thread[],
  opts: { includeExtractionInstruction?: boolean; maxTokens?: number } = {}
): string {
  // Reserve space for the extraction instruction so the final block
  // (context + '\n\n' + EXTRACTION_INSTRUCTION) stays within the token budget.
  const instructionReserve = opts.includeExtractionInstruction !== false
    ? ('\n\n' + EXTRACTION_INSTRUCTION).length
    : 0
  const maxChars = (opts.maxTokens ?? MAX_TOKENS) * CHARS_PER_TOKEN - instructionReserve
  const sections: string[] = []

  // Profile section
  const profileEntries = Object.entries(profile)
  if (profileEntries.length > 0) {
    sections.push(`## User profile\n` + profileEntries.map(([k, v]) => `- ${k}: ${v}`).join('\n'))
  }

  // Memories by type (procedural first — most important for behaviour)
  const byType: Record<string, Memory[]> = {
    procedural: [], semantic: [], preference: [], episodic: []
  }
  for (const m of memories) {
    if (!m.decayedAt) byType[m.type]?.push(m)
  }

  for (const [type, mems] of Object.entries(byType)) {
    if (!mems.length) continue
    const sorted = mems.sort((a, b) => b.importance - a.importance || b.relevanceScore - a.relevanceScore)
    sections.push(
      `## ${type.charAt(0).toUpperCase() + type.slice(1)} memories\n` +
      sorted.map(m => `- [${m.importance}★] ${m.content}`).join('\n')
    )
  }

  // Open threads
  const openThreads = threads.filter(t => t.status !== 'resolved').slice(0, 8)
  if (openThreads.length > 0) {
    sections.push(
      `## Open tasks\n` +
      openThreads.map(t => `- [${t.priority.toUpperCase()}] ${t.title}`).join('\n')
    )
  }

  if (!sections.length) {
    return opts.includeExtractionInstruction !== false ? EXTRACTION_INSTRUCTION : ''
  }

  let block = `[Memory Engine context — use this to personalise your response]\n\n` + sections.join('\n\n')

  // Truncate if over token budget
  if (block.length > maxChars) {
    block = block.substring(0, maxChars) + '\n...[truncated]'
  }

  if (opts.includeExtractionInstruction !== false) {
    block += '\n\n' + EXTRACTION_INSTRUCTION
  }

  return block
}

// Estimate token cost of a system prompt block
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}
