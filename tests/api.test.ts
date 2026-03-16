// tests/api.test.ts
// Covers the HTTP surface of src/app/api/memory/ route handlers.
// Tests are called at the handler level (no running server needed).

import { describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { resetStorage, getStorage } from '../src/lib/storage'
import { join } from 'path'
import { tmpdir } from 'os'

beforeEach(() => {
  process.env.MEMORY_ENGINE_MODE = 'local'
  process.env.MEMORY_ENGINE_DB_PATH = join(tmpdir(), `me-api-test-${Date.now()}.sqlite`)
  resetStorage()
})

function req(method: string, url: string, body?: object): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

// ── GET /api/memory ────────────────────────────────────────

describe('GET /api/memory', () => {
  it('returns memories for a user', async () => {
    const { GET } = await import('../src/app/api/memory/route')
    const storage = getStorage()
    await storage.storeMemory({ userId: 'u1', type: 'semantic', content: 'User loves TypeScript', importance: 4 })

    const res = await GET(req('GET', 'http://localhost/api/memory?userId=u1'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data.some((m: any) => m.content === 'User loves TypeScript')).toBe(true)
  })

  it('rejects invalid type param with 400', async () => {
    const { GET } = await import('../src/app/api/memory/route')
    const res = await GET(req('GET', 'http://localhost/api/memory?userId=u1&type=invalid'))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('Invalid type')
  })

  it('accepts valid type filter', async () => {
    const { GET } = await import('../src/app/api/memory/route')
    const storage = getStorage()
    await storage.storeMemory({ userId: 'u2', type: 'procedural', content: 'Always use pnpm not npm', importance: 5 })

    const res = await GET(req('GET', 'http://localhost/api/memory?userId=u2&type=procedural'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.every((m: any) => m.type === 'procedural')).toBe(true)
  })
})

// ── POST /api/memory ───────────────────────────────────────

describe('POST /api/memory', () => {
  it('stores a valid memory and returns 201 with id', async () => {
    const { POST } = await import('../src/app/api/memory/route')
    const res = await POST(req('POST', 'http://localhost/api/memory', {
      userId: 'u3', type: 'semantic', content: 'User deploys to GCP Cloud Run', importance: 4,
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.id).toBeTruthy()
  })

  it('returns 400 when required fields are missing', async () => {
    const { POST } = await import('../src/app/api/memory/route')
    const res = await POST(req('POST', 'http://localhost/api/memory', { userId: 'u3' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid memory type', async () => {
    const { POST } = await import('../src/app/api/memory/route')
    const res = await POST(req('POST', 'http://localhost/api/memory', {
      userId: 'u3', type: 'bogus', content: 'Some content here', importance: 3,
    }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('Invalid type')
  })

  it('returns 400 for importance out of range', async () => {
    const { POST } = await import('../src/app/api/memory/route')
    const res = await POST(req('POST', 'http://localhost/api/memory', {
      userId: 'u3', type: 'semantic', content: 'Some content here', importance: 9,
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('importance')
  })
})

// ── DELETE /api/memory ─────────────────────────────────────

describe('DELETE /api/memory', () => {
  it('returns 400 when id param is missing', async () => {
    const { DELETE } = await import('../src/app/api/memory/route')
    const res = await DELETE(req('DELETE', 'http://localhost/api/memory'))
    expect(res.status).toBe(400)
  })

  it('soft-deletes an existing memory', async () => {
    const { DELETE } = await import('../src/app/api/memory/route')
    const storage = getStorage()
    const id = await storage.storeMemory({ userId: 'u4', type: 'episodic', content: 'Temp memory to delete', importance: 1 })

    const res = await DELETE(req('DELETE', `http://localhost/api/memory?id=${id}`))
    expect(res.status).toBe(200)
    expect((await res.json()).success).toBe(true)

    const memories = await storage.getMemories('u4')
    expect(memories.find(m => m.id === id)).toBeUndefined()
  })
})

// ── GET /api/memory/inject ─────────────────────────────────

describe('GET /api/memory/inject', () => {
  it('returns empty systemPromptBlock when no memories exist', async () => {
    const { GET } = await import('../src/app/api/memory/inject/route')
    const res = await GET(req('GET', 'http://localhost/api/memory/inject?userId=empty-user'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toHaveProperty('systemPromptBlock')
    expect(data).toHaveProperty('tokenCount')
  })

  it('includes memory content in systemPromptBlock', async () => {
    const { GET } = await import('../src/app/api/memory/inject/route')
    const storage = getStorage()
    await storage.storeMemory({ userId: 'inject-user', type: 'semantic', content: 'User prefers Rust over Go', importance: 4 })

    const res = await GET(req('GET', 'http://localhost/api/memory/inject?userId=inject-user'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.systemPromptBlock).toContain('Rust over Go')
    expect(data.tokenCount).toBeGreaterThan(0)
  })
})

// ── GET /api/memory/threads ────────────────────────────────

describe('GET /api/memory/threads', () => {
  it('returns open threads for a user', async () => {
    const { GET } = await import('../src/app/api/memory/threads/route')
    const storage = getStorage()
    await storage.storeThread({ userId: 'thread-api-user', title: 'Deploy memory engine', priority: 'high', status: 'open' })
    await storage.storeThread({ userId: 'thread-api-user', title: 'Done task', priority: 'low', status: 'resolved' })

    const res = await GET(req('GET', 'http://localhost/api/memory/threads?userId=thread-api-user&status=open'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBe(1)
    expect(data[0].title).toBe('Deploy memory engine')
  })

  it('returns 400 for invalid status param', async () => {
    const { GET } = await import('../src/app/api/memory/threads/route')
    const res = await GET(req('GET', 'http://localhost/api/memory/threads?userId=u&status=bogus'))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('Invalid status')
  })
})

// ── GET /api/memory/health ─────────────────────────────────

describe('GET /api/memory/health', () => {
  it('returns health stats for a user', async () => {
    const { GET } = await import('../src/app/api/memory/health/route')
    const storage = getStorage()
    await storage.storeMemory({ userId: 'health-api-user', type: 'semantic', content: 'Health check memory for api test', importance: 3 })

    const res = await GET(req('GET', 'http://localhost/api/memory/health?userId=health-api-user'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toHaveProperty('totalMemories')
    expect(data).toHaveProperty('healthScore')
    expect(data.healthScore).toBeGreaterThanOrEqual(0)
    expect(data.healthScore).toBeLessThanOrEqual(100)
  })
})

// ── POST /api/memory/health ────────────────────────────────

describe('POST /api/memory/health', () => {
  it('runs decay with userId from JSON body and returns success', async () => {
    const { POST } = await import('../src/app/api/memory/health/route')
    const res = await POST(req('POST', 'http://localhost/api/memory/health', { userId: 'decay-api-user' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.userId).toBe('decay-api-user')
  })

  it('runs decay with userId from query param', async () => {
    const { POST } = await import('../src/app/api/memory/health/route')
    const res = await POST(req('POST', 'http://localhost/api/memory/health?userId=decay-qs-user'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.userId).toBe('decay-qs-user')
  })
})

// ── POST /api/memory/ingest ────────────────────────────────

describe('POST /api/memory/ingest', () => {
  it('stores a Slack message event and returns 201', async () => {
    const { POST } = await import('../src/app/api/memory/ingest/route')
    const res = await POST(req('POST', 'http://localhost/api/memory/ingest', {
      source: 'slack',
      userId: 'ingest-user',
      event: { text: 'Deployed memory engine to Cloud Run', user: 'U123' },
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.stored).toBe(true)
    expect(data.source).toBe('slack')
    expect(data.id).toBeTruthy()
  })

  it('stores a GitHub PR event and returns 201', async () => {
    const { POST } = await import('../src/app/api/memory/ingest/route')
    const res = await POST(req('POST', 'http://localhost/api/memory/ingest', {
      source: 'github',
      userId: 'ingest-user',
      event: { action: 'opened', pull_request: { title: 'Add semantic search', user: { login: 'varun' } } },
    }))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.stored).toBe(true)
  })

  it('skips Slack bot messages and returns 200', async () => {
    const { POST } = await import('../src/app/api/memory/ingest/route')
    const res = await POST(req('POST', 'http://localhost/api/memory/ingest', {
      source: 'slack',
      userId: 'ingest-user',
      event: { bot_id: 'B123', text: 'Bot message' },
    }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.skipped).toBe(true)
  })

  it('returns 400 for invalid source', async () => {
    const { POST } = await import('../src/app/api/memory/ingest/route')
    const res = await POST(req('POST', 'http://localhost/api/memory/ingest', {
      source: 'twitter',
      userId: 'ingest-user',
      event: { text: 'Some tweet' },
    }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('Invalid source')
  })

  it('returns 400 when event is missing', async () => {
    const { POST } = await import('../src/app/api/memory/ingest/route')
    const res = await POST(req('POST', 'http://localhost/api/memory/ingest', {
      source: 'slack',
      userId: 'ingest-user',
    }))
    expect(res.status).toBe(400)
  })
})

// ── POST /api/billing/webhook ──────────────────────────────

describe('POST /api/billing/webhook', () => {
  it('returns 500 when STRIPE_WEBHOOK_SECRET is not configured', async () => {
    const orig = process.env.STRIPE_WEBHOOK_SECRET
    delete process.env.STRIPE_WEBHOOK_SECRET
    const { POST } = await import('../src/app/api/billing/webhook/route')
    const res = await POST(req('POST', 'http://localhost/api/billing/webhook', {}))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toContain('STRIPE_WEBHOOK_SECRET')
    process.env.STRIPE_WEBHOOK_SECRET = orig
  })

  it('returns 400 when stripe-signature header is missing', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
    process.env.STRIPE_SECRET_KEY     = 'sk_test_dummy'
    const { POST } = await import('../src/app/api/billing/webhook/route')
    const r = new NextRequest('http://localhost/api/billing/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'checkout.session.completed' }),
    })
    const res = await POST(r)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBeDefined()
  })
})

// ── POST /api/billing/checkout ─────────────────────────────

describe('POST /api/billing/checkout', () => {
  it('returns 500 when STRIPE_SECRET_KEY is not configured', async () => {
    const original = process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_SECRET_KEY
    const { POST } = await import('../src/app/api/billing/checkout/route')
    const res = await POST(req('POST', 'http://localhost/api/billing/checkout', { userId: 'u1' }))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toContain('STRIPE_SECRET_KEY')
    process.env.STRIPE_SECRET_KEY = original
  })

  it('returns 400 when userId is missing', async () => {
    const origKey   = process.env.STRIPE_SECRET_KEY
    const origPrice = process.env.STRIPE_PRO_PRICE_ID
    process.env.STRIPE_SECRET_KEY   = 'sk_test_dummy'
    process.env.STRIPE_PRO_PRICE_ID = 'price_dummy'
    const { POST } = await import('../src/app/api/billing/checkout/route')
    const res = await POST(req('POST', 'http://localhost/api/billing/checkout', {}))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('userId')
    process.env.STRIPE_SECRET_KEY   = origKey
    process.env.STRIPE_PRO_PRICE_ID = origPrice
  })
})

// ── GET /api/billing/status ────────────────────────────────

describe('GET /api/billing/status', () => {
  it('returns 400 when userId is missing', async () => {
    const { GET } = await import('../src/app/api/billing/status/route')
    const res = await GET(req('GET', 'http://localhost/api/billing/status'))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('userId')
  })

  it('returns plan and mode for a valid userId in local mode', async () => {
    process.env.MEMORY_ENGINE_MODE = 'local'
    const { GET } = await import('../src/app/api/billing/status/route')
    const res = await GET(req('GET', 'http://localhost/api/billing/status?userId=u1'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.plan).toBe('free')
    expect(data.mode).toBe('local')
    expect(data.userId).toBe('u1')
  })
})

// ── POST /api/memory/chat ──────────────────────────────────

describe('POST /api/memory/chat', () => {
  it('returns 400 when message is missing', async () => {
    const { POST } = await import('../src/app/api/memory/chat/route')
    const res = await POST(req('POST', 'http://localhost/api/memory/chat', { userId: 'u1' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when message is empty string', async () => {
    const { POST } = await import('../src/app/api/memory/chat/route')
    const res = await POST(req('POST', 'http://localhost/api/memory/chat', { userId: 'u1', message: '' }))
    expect(res.status).toBe(400)
  })
})

// ── GET /api/memory/export ─────────────────────────────────

describe('GET /api/memory/export', () => {
  it('returns 400 for invalid format', async () => {
    const { GET } = await import('../src/app/api/memory/export/route')
    const res = await GET(req('GET', 'http://localhost/api/memory/export?userId=u1&format=bogus'))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('Invalid format')
  })

  it('returns 200 with json content-type for json format', async () => {
    const { GET } = await import('../src/app/api/memory/export/route')
    const res = await GET(req('GET', 'http://localhost/api/memory/export?userId=u1&format=json'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
  })

  it('returns 200 with text/markdown content-type for markdown format', async () => {
    const { GET } = await import('../src/app/api/memory/export/route')
    const res = await GET(req('GET', 'http://localhost/api/memory/export?userId=u1&format=markdown'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/markdown')
  })
})
