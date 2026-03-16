# Memory Engine — Claude Code Master Context

## What this project is
A local-first, tool-agnostic persistent memory layer for AI agents.
Free tier: SQLite, offline, zero cloud dependency.
Pro tier: Supabase + pgvector, semantic search, multi-device sync.

Built by Varun Tyagi · Berlin · https://meetvaruntyagi.com

---

## Architecture: Two modes, one codebase

### LOCAL MODE (free, default)
- Storage : SQLite via better-sqlite3
- Search  : FTS5 full-text (built into SQLite, zero deps)
- LLM     : MEMORIES_JSON block parsed from any LLM response (no API call)
- Fallback: GPT-4o-mini extracts memories when no block found
- Install : npm install memory-engine-sdk — works immediately

### CLOUD MODE (Pro, opt-in)
- Storage    : Supabase (Postgres + pgvector)
- Search     : Semantic via OpenAI text-embedding-3-small
- Activate   : MEMORY_ENGINE_MODE=cloud + Supabase credentials
- Price      : €9/mo via Stripe

---

## Stack
| Concern | Tool |
|---|---|
| Runtime | Node.js 20+ / TypeScript 5+ |
| Local DB | better-sqlite3 (SQLite) |
| Cloud DB | Supabase — Pro only |
| LLM extraction | OpenAI gpt-4o-mini |
| Embeddings | OpenAI text-embedding-3-small — Pro only |
| Dashboard | Next.js 14 App Router |
| MCP | @modelcontextprotocol/sdk |
| Billing | Stripe — Pro/Team |
| Package mgr | pnpm |
| Deploy | GCP Cloud Run (project: sundaybi, region: europe-west3) |
| Tests | Vitest |

---

## Environment variables

### Local (free) — only these needed
```
OPENAI_API_KEY=sk-...
MEMORY_ENGINE_MODE=local
MEMORY_ENGINE_DB_PATH=~/.memory-engine/db.sqlite   # default, optional
MEMORY_ENGINE_USER_ID=varun                         # default user, optional
```

### Pro (cloud) — additional
```
MEMORY_ENGINE_MODE=cloud
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## Cost model (OpenAI only)
| Operation | Model | Cost |
|---|---|---|
| Extraction via MEMORIES_JSON parse | none | $0 |
| Extraction fallback (no block) | gpt-4o-mini | ~$0.0003/call |
| Pro semantic search | text-embedding-3-small | ~$0.00002/query |
| Pro summarization | gpt-4o-mini | ~$0.001/session |
| Pro conflict detection | gpt-4o-mini | ~$0.0001/check |

Default path costs $0 — MEMORIES_JSON parsed in JS, no API call.

---

## Storage abstraction (CRITICAL — read before writing any code)

ALL database calls go through `src/lib/storage.ts` → `getStorage()`.
NEVER import better-sqlite3 or @supabase/supabase-js directly in features.

```typescript
// Every feature does this:
import { getStorage } from '../lib/storage'
const storage = getStorage()
await storage.storeMemory(...)
await storage.searchMemories(...)
```

`getStorage()` returns either LocalStorage (SQLite) or CloudStorage (Supabase)
depending on MEMORY_ENGINE_MODE. Features never know which backend is running.

### StorageAdapter interface (both backends implement this exactly)
See src/lib/storage/types.ts for full interface definition.

---

## Project structure
```
memory-engine/
├── CLAUDE.md                          ← YOU ARE HERE
├── README.md
├── package.json
├── .env.example
├── database/
│   ├── local-schema.sql               ← SQLite (auto-applied on init)
│   └── cloud-schema.sql               ← Supabase (Pro upgrade)
├── src/
│   ├── lib/
│   │   ├── storage.ts                 ← getStorage() factory — only DB entry point
│   │   ├── storage/
│   │   │   ├── types.ts               ← StorageAdapter interface + all types
│   │   │   ├── local.ts               ← SQLite implementation
│   │   │   └── cloud.ts               ← Supabase implementation (Pro)
│   │   ├── extract.ts                 ← OpenAI gpt-4o-mini memory extraction
│   │   ├── inject.ts                  ← System prompt builder
│   │   ├── decay.ts                   ← Decay scoring
│   │   └── deduplicate.ts             ← FTS5 deduplication
│   ├── sdk/
│   │   ├── ts/
│   │   │   ├── index.ts               ← MemoryEngine class (npm package)
│   │   │   └── package.json
│   │   ├── python/
│   │   │   ├── memory_engine/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── client.py
│   │   │   │   └── langchain.py
│   │   │   └── pyproject.toml
│   │   └── n8n/
│   │       └── MemoryEngine.node.ts
│   ├── mcp/
│   │   └── server.ts                  ← MCP server (stdio + SSE)
│   ├── api/
│   │   ├── memory/
│   │   │   ├── route.ts               ← GET/POST/DELETE memories
│   │   │   ├── chat/route.ts          ← Main chat endpoint
│   │   │   ├── export/route.ts        ← JSON/MD/cursor-rules export
│   │   │   ├── ingest/route.ts        ← Webhook receiver (Pro)
│   │   │   ├── health/route.ts        ← Health metrics (Pro)
│   │   │   └── inject/route.ts        ← Returns system prompt block
│   │   └── billing/
│   │       ├── checkout/route.ts      ← Stripe checkout
│   │       ├── webhook/route.ts       ← Stripe webhook
│   │       └── status/route.ts        ← Plan status
│   └── app/
│       ├── page.tsx                   ← Main dashboard
│       ├── health/page.tsx            ← Health metrics (Pro gate)
│       └── upgrade/page.tsx           ← Upgrade to Pro CTA
├── scripts/
│   ├── init.ts                        ← First-run DB setup
│   ├── decay-cron.ts                  ← Nightly decay
│   ├── summarize-cron.ts              ← Weekly summarization (Pro)
│   └── migrate-to-cloud.ts            ← Local → Supabase migration
├── tests/
│   ├── storage.test.ts                ← Tests BOTH backends
│   ├── extract.test.ts
│   ├── sdk.test.ts
│   └── mcp.test.ts
├── templates/
│   ├── senior-data-engineer.json
│   ├── ai-product-director.json
│   ├── marketing-strategist.json
│   ├── startup-founder.json
│   └── devops-engineer.json
└── docs/
    ├── CLAUDE-CODE-SESSIONS.md        ← 4 session prompts
    └── features/                      ← 20 feature specs
```

---

## Feature build status

### Phase 1 — Must Have (local-first MVP) ← START HERE
- [x] `storage-local`    — SQLite StorageAdapter + auto-init schema
- [x] `storage-cloud`    — Supabase StorageAdapter (same interface)
- [x] `extract`          — OpenAI gpt-4o-mini extraction + MEMORIES_JSON parser
- [x] `inject`           — System prompt builder
- [x] `decay-dedup`      — Decay scoring + FTS5 dedup
- [x] `typescript-sdk`   — MemoryEngine class (me.before / me.after)
- [x] `mcp-server`       — 6 tools, stdio + SSE transport
- [x] `dashboard-ui`     — Next.js 6-tab dashboard (Memory, Chat, Threads, Export, Profile, Health)

### Phase 2 — Should Have (open source launch)
- [x] `python-sdk`       — pip install memory-engine-sdk
- [x] `json-export`      — JSON / Markdown / cursor-rules export (scripts/export.ts)
- [x] `cursor-rules`     — .cursor/memory.md auto-generation
- [x] `readme`           — Production-quality open source README

### Phase 3 — Could Have (Pro tier + integrations)
- [x] `semantic-search`       — pgvector (cloud mode only)
- [x] `summarization`         — GPT-4o-mini session compression (scripts/summarize-cron.ts)
- [x] `proactive-surfacing`   — Inject unrequested relevant memories (chat/route.ts + sdk beforeWithContext)
- [x] `webhook-ingest`        — Slack / GitHub event ingestion (src/app/api/memory/ingest/route.ts)
- [x] `health-dashboard`      — Memory quality metrics (health route + Health tab in dashboard)
- [x] `stripe-billing`        — Pro payment routes (checkout, webhook, status) + upgrade page
- [x] `n8n-node`              — n8n community node (src/sdk/n8n/MemoryEngine.node.ts)

### Phase 4 — Won't Have v1 (Team tier)
- [ ] `multi-tenant-api`     — API keys per customer
- [ ] `audit-log`            — Full read/write trail
- [ ] `team-namespaces`      — Shared team memory
- [ ] `memory-marketplace`   — Persona templates

---

## Coding conventions
- ALL DB calls via getStorage() — never direct SQLite/Supabase imports in features
- better-sqlite3 is synchronous — LocalStorage wraps every method in Promise
- StorageAdapter tests run against BOTH backends (TEST_MODE=local / TEST_MODE=cloud)
- TypeScript strict mode — no `any` types anywhere
- Error handling: typed Result<T> from storage layer, never throw
- Imports: relative paths only, no path aliases

---

## Ralph Loop protocol
One Claude Code session = one phase.
1. Read CLAUDE.md + relevant feature specs in docs/features/
2. Build storage layer changes FIRST (they unblock everything)
3. Write tests passing for BOTH local and cloud adapters
4. Update CLAUDE.md: [ ] → [x] for completed features
5. git commit -m "feat(phase-N): description"

---

## Commands
```bash
pnpm install          # installs + runs postinstall (init)
pnpm dev              # dashboard at localhost:3000
pnpm test             # all tests, local mode
pnpm run mcp          # MCP server on stdio
pnpm run export       # CLI export tool
pnpm run cron:decay   # manual decay run
pnpm run migrate:cloud # local SQLite → Supabase
```

## Deploy (Cloud Run)
```bash
gcloud run deploy memory-engine \
  --source . --project sundaybi --region europe-west3 \
  --set-env-vars MEMORY_ENGINE_MODE=cloud
```

> **Rate limiting on Cloud Run**: The in-process rate limiter (`src/lib/rateLimit.ts`) uses
> an in-memory Map and is only effective when `--concurrency=1` is set. With multiple
> concurrent instances, each instance has its own counter and limits are not enforced
> globally. Add `--concurrency=1` to the deploy command or use a shared store (e.g. Redis)
> for multi-instance deployments.
