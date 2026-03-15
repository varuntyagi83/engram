# Claude Code Session Prompts — OpenAI edition
# 4 phases. One session per phase.
# cd memory-engine && claude → paste the session prompt below.

# ============================================================
# SESSION 1 — Phase 1: Must Have (local-first MVP)
# Goal: npm install → pnpm dev → dashboard running
#       pnpm run mcp → MCP server in Cursor/Claude Code
# ============================================================

Read CLAUDE.md fully before writing a single line of code.
Then build Phase 1 in this exact order (each step unblocks the next):

## Step 1 — Verify existing files compile
These files already exist (stubs or complete):
  src/lib/storage/types.ts     ← complete
  src/lib/storage/local.ts     ← complete
  src/lib/storage/cloud.ts     ← complete
  src/lib/storage.ts           ← complete
  src/lib/extract.ts           ← complete
  src/lib/inject.ts            ← complete
  src/sdk/ts/index.ts          ← complete
  src/mcp/server.ts            ← complete
  scripts/init.ts              ← complete

Run: pnpm install
Then: npx tsc --noEmit
Fix any TypeScript errors before proceeding.

## Step 2 — Run existing tests
Run: pnpm test
Tests in tests/storage.test.ts, tests/extract.test.ts, tests/sdk.test.ts
Fix until all pass (local mode only — TEST_MODE=local is default).

## Step 3 — database/local-schema.sql
Already exists. Verify it applies correctly:
  node -e "const D=require('better-sqlite3'); const db=new D('/tmp/test.sqlite'); const fs=require('fs'); db.exec(fs.readFileSync('database/local-schema.sql','utf8')); console.log('schema ok'); db.close()"

## Step 4 — scripts/decay-cron.ts
Create scripts/decay-cron.ts:
  Calls storage.updateRelevanceScores() for all active users
  Logs: "Decay run: N memories updated, N decayed" 
  Can be run manually: pnpm run cron:decay
  Add to package.json scripts: "cron:decay": "tsx scripts/decay-cron.ts"

## Step 5 — Dashboard UI (Next.js)
Create src/app/page.tsx — the main 5-tab dashboard:

Tab 1: Chat
  - Text input + send button
  - Calls /api/memory/chat endpoint
  - Shows memory injection banner (how many memories used)
  - Shows clean response (MEMORIES_JSON block stripped)
  - Sidebar: recent memories list + open threads list

Tab 2: Memory
  - Grid of memory cards (all types)
  - Filter by type (All / Episodic / Semantic / Preference / Procedural)
  - Search input (calls searchMemories)
  - Edit / delete per card
  - New memory form

Tab 3: Threads
  - 4-column kanban: Open / In Progress / Snoozed / Resolved
  - Drag or click to advance status
  - Add thread button

Tab 4: Profile
  - Key-value grid of user profile
  - Auto-built label: shows when each key was last updated
  - Edit values inline

Tab 5: System Prompt
  - Read-only view of the exact system prompt block
  - Token count estimate
  - Refresh button

## Step 6 — API routes
Create these Next.js API routes:

src/api/memory/route.ts
  GET  ?userId=x&type=x&limit=x  → Memory[]
  POST { userId, type, content, importance } → { id }
  DELETE ?id=x → { success }

src/api/memory/chat/route.ts
  POST { userId, message, conversationHistory[], sessionId? }
  → Fetches memories → builds system prompt → calls OpenAI gpt-4o
  → Extracts memories from response → stores async
  → Returns { reply: string (clean), memoriesExtracted: number, sessionId }

src/api/memory/inject/route.ts
  GET ?userId=x → { systemPromptBlock: string, tokenCount: number }

src/api/memory/export/route.ts
  GET ?userId=x&format=json|markdown|cursor-rules → file download

## Step 7 — mcp-config generation script
Create scripts/setup-mcp.ts:
  Detects OS, writes correct .cursor/mcp.json for current project
  Prints instructions for ~/.claude.json
  Run: pnpm run mcp:setup

## Step 8 — Verify everything works end-to-end
  pnpm test                     # all tests pass
  pnpm run init                 # DB created at ~/.memory-engine/db.sqlite
  pnpm dev                      # dashboard at localhost:3000
  pnpm run mcp                  # MCP server starts without error

Update CLAUDE.md: mark all Phase 1 features [x]
git add -A && git commit -m "feat(phase-1): local-first MVP complete — SQLite + OpenAI"


# ============================================================
# SESSION 2 — Phase 2: Should Have (open source launch)
# Goal: GitHub repo ready to publish, Show HN post ready
# ============================================================

Read CLAUDE.md. Phase 1 features should all be [x].

## Python SDK
Create src/sdk/python/ as a complete installable package:

memory_engine/__init__.py: exports MemoryEngine
memory_engine/client.py:
  class MemoryEngine:
    def __init__(self, user_id="default", api_url=None, api_key=None)
    async def before(self, messages: list[dict]) -> list[dict]
    async def after(self, response: str) -> None
    def after_sync(self, response: str) -> None  # non-async version
    async def get_profile(self) -> dict
    async def get_threads(self) -> list
    async def export_memories(self, format="json") -> str

memory_engine/langchain.py:
  class MemoryEngineMemory(BaseChatMemory):
    # LangChain integration
    user_id: str
    def load_memory_variables(self, inputs) -> dict
    def save_context(self, inputs, outputs) -> None

pyproject.toml: pip installable as memory-engine-sdk
  Requires: openai>=1.0, httpx

README in src/sdk/python/ with 3-line quickstart

Test: pip install -e src/sdk/python && python -c "from memory_engine import MemoryEngine; print('ok')"

## CLI export tool
Create scripts/export.ts (the pnpm run export command):
  Flags: --user-id, --format (json|markdown|cursor-rules), --output
  Default: writes to stdout
  Example: pnpm run export --format cursor-rules --output .cursor/memory.md

## n8n community node
Create src/sdk/n8n/MemoryEngine.node.ts:
  Operation: Retrieve
    Input: userId (string), query (optional)
    Output: { memories[], profile{}, systemPromptBlock: string }
  Operation: Store
    Input: userId, llmResponse (raw text from LLM node)
    Output: { memoriesStored: number }
  Credential: MemoryEngineApi { url, apiKey (optional) }
  Generate: n8n-workflow-sample.json — sample workflow importable in n8n
    Structure: Manual trigger → Memory Retrieve → OpenAI → Memory Store → Respond

## Production README
Rewrite README.md as production-quality open source README:
  - Hero section: "Local-first persistent memory for AI agents"
  - Install badge + npm badge
  - 3-step quickstart (install → set key → use)
  - MCP setup for Cursor and Claude Code (copy-paste configs)
  - TypeScript + Python + n8n usage examples
  - Free vs Pro comparison table
  - Architecture diagram (ASCII art)
  - Contributing guide
  - License: MIT

## .gitignore
Create comprehensive .gitignore:
  node_modules, .env*, *.sqlite, dist/, .next/, __pycache__

Update CLAUDE.md Phase 2 features [x]
git add -A && git commit -m "feat(phase-2): open source launch ready"


# ============================================================
# SESSION 3 — Phase 3: Could Have (Pro tier — first revenue)
# Goal: Stripe checkout → first paying Pro users
# ============================================================

Read CLAUDE.md. Phases 1+2 should be [x].

Pro features run in MEMORY_ENGINE_MODE=cloud only.
Local users see upgrade prompts — never errors.

## Semantic search (Pro gate)
In src/lib/storage/cloud.ts — searchMemories() already uses pgvector.
Add to cloud-schema.sql the me_search_memories() RPC function.
In local.ts — searchMemories() already uses FTS5.
No changes needed. The abstraction handles it.

Add to dashboard Memory tab: "Upgrade to Pro for semantic search" banner
when MEMORY_ENGINE_MODE=local and user tries advanced search.

## Memory summarization (Pro)
Create src/lib/summarize.ts:
  async function summarizeSessions(userId: string, storage: StorageAdapter):
    1. Get episodic memories grouped by session_id
    2. For each session with >5 episodic memories:
       Call gpt-4o-mini: "Summarize these N memories into 3 key facts"
       Store summaries as semantic memories (importance = avg+1, max 5)
       Soft-delete originals
    3. Return: { sessionsProcessed, memoriesCompressed, memoriesCreated }
  
Create scripts/summarize-cron.ts — weekly runner
Add: pnpm run cron:summarize to package.json

## Webhook ingest (Pro)
Create src/api/memory/ingest/route.ts:
  POST /api/memory/ingest
  Headers: X-Memory-Signature: sha256=<hmac> (verify with MEMORY_ENGINE_WEBHOOK_SECRET)
  Body: { source: "slack"|"github"|"custom", userId: string, data: any }
  
  Source adapters:
    slack: extract from message.text field
    github: extract from PR title + body (merged events)
    custom: pass raw data to gpt-4o-mini for extraction

## Health dashboard (Pro)
Create src/app/health/page.tsx:
  Show HealthStats from storage.healthStats()
  Charts (use recharts — already in Next.js ecosystem):
    - Memories by type (bar)
    - Memories added per day last 30 days (line)
    - Decay distribution (pie)
  Health score display (0-100 with color coding)
  Gate: blur overlay + "Upgrade to Pro" button for local users

## Stripe billing
Create src/api/billing/:

checkout/route.ts:
  POST { userId, plan: "pro"|"team" }
  Creates Stripe Checkout session for:
    Pro: €9/mo (price_pro_monthly)
    Team: €29/seat/mo (price_team_monthly)
  Returns { checkoutUrl }

webhook/route.ts:
  POST Stripe webhook
  On checkout.session.completed:
    Set user as Pro in user_profiles: { plan: "pro", plan_activated_at: now }
    Trigger migrate-to-cloud if they have local data

status/route.ts:
  GET ?userId=x → { plan: "free"|"pro"|"team", activatedAt? }

Create src/app/upgrade/page.tsx — upgrade landing page:
  Free vs Pro vs Team feature comparison
  "Upgrade Now" button → calls /api/billing/checkout
  
## scripts/migrate-to-cloud.ts
  1. Read all local SQLite data via LocalStorage.exportAll()
  2. Write to Supabase via CloudStorage.importAll()
  3. Verify: count rows in both DBs match
  4. Print migration summary

Update CLAUDE.md Phase 3 [x]
git add -A && git commit -m "feat(phase-3): pro tier + stripe billing"


# ============================================================
# SESSION 4 — Phase 4: Team tier (enterprise features)
# Only build after Phase 3 has real paying Pro users
# ============================================================

Read CLAUDE.md. Phases 1-3 should be [x].

## Multi-tenant API keys
Create src/lib/auth.ts:
  function generateApiKey(): { key: string, prefix: string, hash: string }
    key format: mem_live_<32 random chars>
    prefix: first 8 chars (for display)
    hash: bcrypt of key (stored in DB, key shown once)
  
  async function validateApiKey(key: string): { agentId, userId?, rateLimit }
    Lookup by hash in me_api_keys table
    Check not revoked
    Check rate limit (sliding window — track in me_usage_events)
    
Apply to all API routes: extract key from Authorization: Bearer header

Create src/api/keys/route.ts:
  POST { agentId, userId? } → creates key, returns full key ONCE
  GET → lists keys (prefix only, never full key)
  DELETE ?id=x → revokes key

## Audit log
Add audit logging to StorageAdapter:
  Log every read + write to me_audit_log table (cloud mode only)
  Add response header: X-Memory-IDs-Used: uuid,uuid,uuid
  
Create src/api/memory/audit/route.ts:
  GET ?userId=x&sessionId=x → audit entries
  "Why did you say that?" endpoint: returns which memories influenced a response

Dashboard: add Audit tab showing recent read/write events with memory content.

## Team namespaces
Add to CloudStorage:
  getNamespaces(userId): returns all namespaces user has access to
  switchNamespace(agentId): creates new CloudStorage scoped to that agent

Team invite flow:
  POST /api/team/invite { email, agentId } → sends invite
  POST /api/team/accept { token } → grants access

Dashboard: Team view tab showing all namespace members

## Memory marketplace templates
templates/ directory already has 5 JSON files from scaffold.
Create POST /api/memory/apply-template:
  Body: { templateId, userId }
  Inserts template memories with importance - 1 (lower than user memories)
  Returns: { applied: number }

Dashboard: Templates tab with card grid, preview on click, "Apply" button.

When all 4 phases complete:
  pnpm test  # all tests pass
  gcloud run deploy memory-engine --source . --project sundaybi --region europe-west3 --set-env-vars MEMORY_ENGINE_MODE=cloud
  git tag v1.0.0 && git push --tags
  git commit -m "feat: v1.0.0 — all 20 features complete"
  
Update CLAUDE.md: ALL features [x]
