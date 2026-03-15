// tests/sdk.test.ts

import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryEngine } from '../src/sdk/ts/index'
import { resetStorage } from '../src/lib/storage'
import { join } from 'path'
import { tmpdir } from 'os'

// Use a fresh temp DB for each test
beforeEach(() => {
  process.env.MEMORY_ENGINE_MODE = 'local'
  process.env.MEMORY_ENGINE_DB_PATH = join(tmpdir(), `me-sdk-test-${Date.now()}.sqlite`)
  resetStorage()
})

describe('MemoryEngine SDK', () => {

  describe('before()', () => {
    it('returns messages unchanged when no memories exist', async () => {
      const me = new MemoryEngine({ userId: 'new-user' })
      const messages = [{ role: 'user' as const, content: 'Hello' }]
      const result = await me.before(messages)
      expect(result).toEqual(messages)
    })

    it('prepends system message when memories exist', async () => {
      const me = new MemoryEngine({ userId: 'mem-user' })
      await me.storeMemory('semantic', 'User works in Berlin', 4)
      await me.storeMemory('preference', 'Prefers TypeScript', 3)

      const messages = [{ role: 'user' as const, content: 'Help me code' }]
      const result = await me.before(messages)

      expect(result.length).toBe(2)
      expect(result[0].role).toBe('system')
      expect(result[0].content).toContain('Berlin')
      expect(result[1]).toEqual(messages[0])
    })

    it('extends existing system message', async () => {
      const me = new MemoryEngine({ userId: 'sys-user' })
      await me.storeMemory('semantic', 'User is a data engineer', 4)

      const messages = [
        { role: 'system' as const, content: 'You are a helpful assistant.' },
        { role: 'user' as const, content: 'Hello' },
      ]
      const result = await me.before(messages)

      expect(result.length).toBe(2)
      expect(result[0].role).toBe('system')
      expect(result[0].content).toContain('data engineer')
      expect(result[0].content).toContain('You are a helpful assistant.')
    })
  })

  describe('getSystemPrompt()', () => {
    it('returns empty string when no memories', async () => {
      const me = new MemoryEngine({ userId: 'empty-user' })
      const prompt = await me.getSystemPrompt()
      expect(prompt).toBe('')
    })

    it('includes memory context when memories exist', async () => {
      const me = new MemoryEngine({ userId: 'prompt-user' })
      await me.storeMemory('procedural', 'Uses sundaybi GCP project', 5)

      const prompt = await me.getSystemPrompt('You are helpful.')
      expect(prompt).toContain('sundaybi GCP')
      expect(prompt).toContain('You are helpful.')
    })
  })

  describe('after() / afterAsync()', () => {
    it('stores memories from MEMORIES_JSON block', async () => {
      const me = new MemoryEngine({ userId: 'after-user' })

      const response = `Here is my answer.
MEMORIES_JSON:{"memories":[{"type":"semantic","content":"User builds AdForge with Gemini","importance":4}],"profile":{"company":"Sunday Natural"},"threads":[]}`

      const result = await me.afterAsync(response)
      expect(result.memoriesStored).toBe(1)
      expect(result.profileUpdated).toBe(1)

      const memories = await me.getMemories()
      expect(memories.find(m => m.content === 'User builds AdForge with Gemini')).toBeDefined()

      const profile = await me.getProfile()
      expect(profile.company).toBe('Sunday Natural')
    })

    it('deduplicates similar memories', async () => {
      const me = new MemoryEngine({ userId: 'dedup-user' })

      const r1 = `Response 1\nMEMORIES_JSON:{"memories":[{"type":"semantic","content":"User prefers FastAPI over Flask","importance":3}],"profile":{},"threads":[]}`
      const r2 = `Response 2\nMEMORIES_JSON:{"memories":[{"type":"semantic","content":"User prefers FastAPI","importance":3}],"profile":{},"threads":[]}`

      await me.afterAsync(r1)
      await me.afterAsync(r2)

      const memories = await me.getMemories()
      const fastapi = memories.filter(m => m.content.toLowerCase().includes('fastapi'))
      expect(fastapi.length).toBe(1)
    })
  })

  describe('clean()', () => {
    it('removes MEMORIES_JSON block from response', () => {
      const me = new MemoryEngine()
      const raw = `Here is my response.\n\nMEMORIES_JSON:{"memories":[],"profile":{},"threads":[]}`
      expect(me.clean(raw)).toBe('Here is my response.')
    })
  })

  describe('exportMemories()', () => {
    it('exports as JSON', async () => {
      const me = new MemoryEngine({ userId: 'export-user' })
      await me.storeMemory('semantic', 'Test export memory', 3)
      const json = await me.exportMemories('json')
      const parsed = JSON.parse(json)
      expect(parsed.version).toBe('1.0')
      expect(parsed.memories.length).toBeGreaterThan(0)
    })

    it('exports as cursor-rules', async () => {
      const me = new MemoryEngine({ userId: 'cursor-user' })
      await me.storeMemory('procedural', 'Uses pnpm not npm', 4)
      const rules = await me.exportMemories('cursor-rules')
      expect(rules).toContain('Memory Engine Context')
      expect(rules).toContain('Uses pnpm not npm')
    })
  })

})
