// tests/storage.test.ts
// Runs against BOTH local (SQLite) and cloud (Supabase) backends.
// Set TEST_MODE=local or TEST_MODE=cloud to select backend.
// Default: local.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { LocalStorage } from '../src/lib/storage/local'
import type { StorageAdapter } from '../src/lib/storage/types'
import { join } from 'path'
import { tmpdir } from 'os'

const mode = process.env.TEST_MODE ?? 'local'
const TEST_DB = join(tmpdir(), `me-test-${Date.now()}.sqlite`)

let storage: StorageAdapter

beforeAll(async () => {
  if (mode === 'cloud') {
    const { CloudStorage } = await import('../src/lib/storage/cloud')
    storage = new CloudStorage()
  } else {
    storage = new LocalStorage(TEST_DB)
  }
})

afterAll(() => { storage.close() })

describe(`StorageAdapter (${mode})`, () => {

  describe('memories', () => {
    it('stores and retrieves a memory', async () => {
      const id = await storage.storeMemory({
        userId: 'test-user', type: 'semantic',
        content: 'User prefers TypeScript over JavaScript',
        importance: 4,
      })
      expect(id).toBeTruthy()

      const memories = await storage.getMemories('test-user')
      const found = memories.find(m => m.id === id)
      expect(found).toBeDefined()
      expect(found!.content).toBe('User prefers TypeScript over JavaScript')
      expect(found!.type).toBe('semantic')
      expect(found!.importance).toBe(4)
    })

    it('filters by type', async () => {
      await storage.storeMemory({ userId: 'test-user', type: 'episodic', content: 'Discussed project setup', importance: 2 })
      const episodic = await storage.getMemories('test-user', { type: 'episodic' })
      expect(episodic.every(m => m.type === 'episodic')).toBe(true)
    })

    it('soft-deletes a memory', async () => {
      const id = await storage.storeMemory({
        userId: 'test-user', type: 'episodic', content: 'To be deleted', importance: 1
      })
      await storage.deleteMemory(id)
      const memories = await storage.getMemories('test-user')
      expect(memories.find(m => m.id === id)).toBeUndefined()
      // With includeDecayed it should show up
      const all = await storage.getMemories('test-user', { includeDecayed: true })
      const deleted = all.find(m => m.id === id)
      expect(deleted?.decayedAt).toBeTruthy()
    })

    it('searches memories', async () => {
      await storage.storeMemory({ userId: 'search-user', type: 'preference', content: 'Loves Berlin winters', importance: 3 })
      const results = await storage.searchMemories('search-user', 'Berlin')
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].content).toContain('Berlin')
    })
  })

  describe('profile', () => {
    it('upserts profile keys', async () => {
      await storage.upsertProfile('profile-user', { name: 'Varun', role: 'Director of Data', city: 'Berlin' })
      const profile = await storage.getProfile('profile-user')
      expect(profile.name).toBe('Varun')
      expect(profile.role).toBe('Director of Data')
      expect(profile.city).toBe('Berlin')
    })

    it('updates an existing key', async () => {
      await storage.setProfileKey('profile-user', 'city', 'Munich')
      const profile = await storage.getProfile('profile-user')
      expect(profile.city).toBe('Munich')
    })
  })

  describe('threads', () => {
    it('stores and retrieves a thread', async () => {
      await storage.storeThread({
        userId: 'thread-user', title: 'Finish AdProfit Phase 3',
        priority: 'high', status: 'open',
      })
      const threads = await storage.getThreads('thread-user', 'open')
      expect(threads.length).toBeGreaterThan(0)
      expect(threads[0].title).toBe('Finish AdProfit Phase 3')
    })

    it('resolves a thread', async () => {
      const id = await storage.storeThread({
        userId: 'thread-user2', title: 'Deploy to Cloud Run', priority: 'medium',
      })
      await storage.updateThread(id, { status: 'resolved' })
      const open = await storage.getThreads('thread-user2', 'open')
      expect(open.find(t => t.id === id)).toBeUndefined()
    })
  })

  describe('health', () => {
    it('returns health stats', async () => {
      await storage.storeMemory({ userId: 'health-user', type: 'semantic', content: 'Health test memory', importance: 3 })
      const stats = await storage.healthStats('health-user')
      expect(stats.totalMemories).toBeGreaterThan(0)
      expect(stats.healthScore).toBeGreaterThanOrEqual(0)
      expect(stats.healthScore).toBeLessThanOrEqual(100)
    })
  })

  describe('decay scoring', () => {
    it('freshly created memory has relevance_score ≈ importance (age ≈ 0)', async () => {
      // Formula: importance × exp(-k × age_days). At age ≈ 0: score ≈ importance.
      // This verifies the formula is applied correctly and the constants are wired up.
      await storage.storeMemory({ userId: 'decay-math', type: 'episodic',   content: 'Episodic importance 5 created now', importance: 5 })
      await storage.storeMemory({ userId: 'decay-math', type: 'semantic',   content: 'Semantic importance 3 created now', importance: 3 })
      await storage.storeMemory({ userId: 'decay-math', type: 'procedural', content: 'Procedural importance 4 created now', importance: 4 })

      await storage.updateRelevanceScores('decay-math')

      const memories = await storage.getMemories('decay-math')
      expect(memories.length).toBe(3)
      for (const m of memories) {
        // Within 1% of importance for a freshly created memory
        expect(m.relevanceScore).toBeGreaterThanOrEqual(m.importance * 0.99)
        expect(m.relevanceScore).toBeLessThanOrEqual(m.importance * 1.01)
      }
    })

    it('fresh importance-5 memory is not soft-deleted by decay run', async () => {
      // relevance_score ≈ 5 at age 0, well above the 0.05 soft-delete threshold
      const id = await storage.storeMemory({
        userId: 'decay-nodelete', type: 'procedural',
        content: 'Critical decision made right now', importance: 5,
      })
      await storage.updateRelevanceScores('decay-nodelete')
      const memories = await storage.getMemories('decay-nodelete')
      expect(memories.find(m => m.id === id)).toBeDefined()
    })
  })

  describe('export/import', () => {
    it('exports and re-imports correctly', async () => {
      await storage.storeMemory({ userId: 'export-user', type: 'procedural', content: 'Export test memory', importance: 4 })
      const payload = await storage.exportAll('export-user')
      expect(payload.version).toBe('1.0')
      expect(payload.memories.length).toBeGreaterThan(0)

      // Import should skip duplicates
      const result = await storage.importAll(payload)
      expect(result.skipped).toBe(payload.memories.length)
      expect(result.imported).toBe(0)
    })
  })

})
