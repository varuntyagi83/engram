// src/lib/storage.ts
// The ONLY entry point for all DB operations.
// Every feature imports getStorage() from here.

import type { StorageAdapter } from './storage/types'
import { LocalStorage } from './storage/local'
import { CloudStorage } from './storage/cloud'

let _instance: StorageAdapter | null = null

export function getStorage(): StorageAdapter {
  if (_instance) return _instance
  const mode = process.env.MEMORY_ENGINE_MODE ?? 'local'
  if (mode === 'cloud') {
    _instance = new CloudStorage()
  } else {
    _instance = new LocalStorage()
  }
  return _instance!
}

export function resetStorage(): void {
  if (_instance) { _instance.close(); _instance = null }
}

export type {
  StorageAdapter, Memory, MemoryInput, MemoryType,
  Thread, ThreadInput, ThreadStatus, ThreadPriority,
  UserProfile, ExportPayload, HealthStats, Result,
  GetMemoriesOpts, SearchOpts, ExtractResult,
  ExtractedMemory, ExtractedThread, StorageMode,
} from './storage/types'
export { ok, err } from './storage/types'
