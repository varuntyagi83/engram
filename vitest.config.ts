import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 15000,
    env: {
      MEMORY_ENGINE_MODE: process.env.TEST_MODE ?? 'local',
    },
  },
})
