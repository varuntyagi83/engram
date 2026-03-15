// tests/extract.test.ts

import { describe, it, expect } from 'vitest'
import { extractFromResponse, stripMemoriesBlock, EXTRACTION_INSTRUCTION } from '../src/lib/extract'

describe('extractFromResponse', () => {

  it('parses MEMORIES_JSON block (Path A — free)', async () => {
    const response = `Sure, here's the answer to your question.

Some helpful content here.

MEMORIES_JSON:{"memories":[{"type":"semantic","content":"User prefers FastAPI over Flask","importance":4},{"type":"preference","content":"Wants code first, explanation after","importance":3}],"profile":{"role":"Director of Data","location":"Berlin"},"threads":[{"title":"Deploy memory engine","action":"add","priority":"high"}]}`

    const result = await extractFromResponse(response)
    expect(result.memories).toHaveLength(2)
    expect(result.memories[0].type).toBe('semantic')
    expect(result.memories[0].content).toBe('User prefers FastAPI over Flask')
    expect(result.memories[0].importance).toBe(4)
    expect(result.profile.role).toBe('Director of Data')
    expect(result.threads).toHaveLength(1)
    expect(result.threads[0].title).toBe('Deploy memory engine')
    expect(result.threads[0].priority).toBe('high')
  })

  it('returns empty result when no block and no API key', async () => {
    const original = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY

    const result = await extractFromResponse('Just a plain response with no memories block.')
    expect(result.memories).toHaveLength(0)
    expect(result.profile).toEqual({})
    expect(result.threads).toHaveLength(0)

    process.env.OPENAI_API_KEY = original
  })

  it('filters out short/empty memories', async () => {
    const response = `MEMORIES_JSON:{"memories":[{"type":"episodic","content":"hi","importance":3},{"type":"semantic","content":"User works in Berlin as Director of Data","importance":4}],"profile":{},"threads":[]}`
    const result = await extractFromResponse(response)
    expect(result.memories).toHaveLength(1) // 'hi' filtered out (< 8 chars)
  })

  it('handles malformed JSON gracefully', async () => {
    const response = `MEMORIES_JSON:{broken json here`
    const result = await extractFromResponse(response)
    expect(result.memories).toHaveLength(0)
  })

  it('clamps importance to 1-5', async () => {
    const response = `MEMORIES_JSON:{"memories":[{"type":"semantic","content":"Valid memory content here","importance":99}],"profile":{},"threads":[]}`
    const result = await extractFromResponse(response)
    expect(result.memories[0].importance).toBe(5)
  })

})

describe('stripMemoriesBlock', () => {
  it('removes MEMORIES_JSON block from response', () => {
    const response = `Here is my answer.\n\nMEMORIES_JSON:{"memories":[],"profile":{},"threads":[]}`
    const clean = stripMemoriesBlock(response)
    expect(clean).toBe('Here is my answer.')
    expect(clean).not.toContain('MEMORIES_JSON')
  })

  it('returns unchanged text when no block present', () => {
    const text = 'Just a normal response.'
    expect(stripMemoriesBlock(text)).toBe(text)
  })
})

describe('EXTRACTION_INSTRUCTION', () => {
  it('contains required format markers', () => {
    expect(EXTRACTION_INSTRUCTION).toContain('MEMORIES_JSON:')
    expect(EXTRACTION_INSTRUCTION).toContain('episodic')
    expect(EXTRACTION_INSTRUCTION).toContain('semantic')
    expect(EXTRACTION_INSTRUCTION).toContain('preference')
    expect(EXTRACTION_INSTRUCTION).toContain('procedural')
  })
})
