// tests/mcp.test.ts
// Verifies MCP server tools work correctly via the storage layer.
// Does not start an actual MCP server — tests the handlers directly.

import { describe, it, expect, beforeEach } from 'vitest'
import { resetStorage, getStorage } from '../src/lib/storage'
import { buildSystemPrompt } from '../src/lib/inject'
import { join } from 'path'
import { tmpdir } from 'os'

beforeEach(() => {
  process.env.MEMORY_ENGINE_MODE = 'local'
  process.env.MEMORY_ENGINE_DB_PATH = join(tmpdir(), `me-mcp-test-${Date.now()}.sqlite`)
  resetStorage()
})

describe('MCP tool logic', () => {

  it('get_memories returns stored memories', async () => {
    const storage = getStorage()
    await storage.storeMemory({ userId: 'mcp-user', type: 'semantic', content: 'User is based in Berlin', importance: 4 })
    const memories = await storage.getMemories('mcp-user')
    expect(memories.length).toBeGreaterThan(0)
    expect(memories[0].content).toContain('Berlin')
  })

  it('store_memory persists and is retrievable', async () => {
    const storage = getStorage()
    const id = await storage.storeMemory({
      userId: 'mcp-user2', type: 'procedural',
      content: 'Deploy always to europe-west3', importance: 5
    })
    expect(id).toBeTruthy()
    const memories = await storage.getMemories('mcp-user2')
    expect(memories.find(m => m.id === id)).toBeDefined()
  })

  it('get_user_profile returns profile keys', async () => {
    const storage = getStorage()
    await storage.upsertProfile('profile-user', { name: 'Varun', city: 'Berlin' })
    const profile = await storage.getProfile('profile-user')
    expect(profile.name).toBe('Varun')
    expect(profile.city).toBe('Berlin')
  })

  it('get_open_threads returns only non-resolved threads', async () => {
    const storage = getStorage()
    await storage.storeThread({ userId: 'thread-user', title: 'Open task', status: 'open', priority: 'high' })
    await storage.storeThread({ userId: 'thread-user', title: 'Done task', status: 'resolved', priority: 'low' })
    const open = await storage.getThreads('thread-user', ['open', 'in_progress'])
    expect(open.length).toBe(1)
    expect(open[0].title).toBe('Open task')
  })

  it('resolve_thread marks it resolved', async () => {
    const storage = getStorage()
    const id = await storage.storeThread({ userId: 'resolve-user', title: 'Task to resolve', priority: 'medium' })
    await storage.updateThread(id, { status: 'resolved' })
    const resolved = await storage.getThreads('resolve-user', 'resolved')
    expect(resolved.find(t => t.id === id)).toBeDefined()
    expect(resolved.find(t => t.id === id)!.resolvedAt).toBeTruthy()
  })

  it('get_system_prompt_block returns non-empty string with memories', async () => {
    const storage = getStorage()
    await storage.storeMemory({ userId: 'prompt-user', type: 'semantic', content: 'User uses OpenAI gpt-4o', importance: 4 })
    await storage.upsertProfile('prompt-user', { role: 'Director of Data' })
    const memories = await storage.getMemories('prompt-user', { limit: 15 })
    const profile  = await storage.getProfile('prompt-user')
    const threads  = await storage.getThreads('prompt-user', ['open', 'in_progress'])
    const block = buildSystemPrompt(memories, profile, threads)
    expect(block).toContain('gpt-4o')
    expect(block).toContain('Director of Data')
    expect(block).toContain('MEMORIES_JSON')
    expect(block.length).toBeGreaterThan(50)
  })

})
