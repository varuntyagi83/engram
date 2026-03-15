# Engram — Memory Engine

Local-first persistent memory for AI agents.
`npm install memory-engine-sdk`  •  `pip install memory-engine-sdk`  •  Works with any LLM

[![npm version](https://img.shields.io/npm/v/memory-engine-sdk?color=cb3837&label=npm)](https://www.npmjs.com/package/memory-engine-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/varuntyagi83/memory-engine)

---

## What it does

Agents forget everything between sessions. Engram gives them persistent memory — episodic, semantic, preference, and procedural — stored locally in SQLite with zero cloud dependency. Upgrade to Pro for pgvector semantic search and multi-device sync via Supabase.

---

## Quickstart — TypeScript

```bash
npm install memory-engine-sdk
```

```typescript
import { MemoryEngine } from 'memory-engine-sdk'

const me = new MemoryEngine({ userId: 'alice' })

// Before your LLM call — inject relevant memory context into the message list
const messages = await me.before([{ role: 'user', content: 'What should I work on today?' }])

// Call any LLM as normal
const reply = await callOpenAI(messages)

// After — extract and store new memories from the response (non-blocking, $0 cost)
me.after(reply)
```

Set your environment variable once and the engine works immediately:

```bash
OPENAI_API_KEY=sk-...   # used only as fallback when no MEMORIES_JSON block found
```

---

## Quickstart — Python

```bash
pip install memory-engine-sdk
```

```python
from memory_engine import MemoryEngine

me = MemoryEngine(user_id="alice", api_url="http://localhost:3000")

messages = await me.before([{"role": "user", "content": "Hello"}])
reply = call_openai(messages)
me.after_sync(reply)
```

LangChain integration:

```python
from memory_engine.langchain import MemoryEngineMemory
from langchain.chains import ConversationChain

chain = ConversationChain(llm=llm, memory=MemoryEngineMemory(user_id="alice"))
```

---

## MCP setup — Cursor and Claude Code

Run the setup script to auto-generate both config files:

```bash
pnpm run mcp:setup
```

Or copy-paste manually.

**Cursor** — add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "memory-engine": {
      "command": "npx",
      "args": ["memory-engine", "mcp"],
      "env": {
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```

**Claude Code** — add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "memory-engine": {
      "command": "npx",
      "args": ["memory-engine", "mcp"],
      "env": {
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```

Restart your editor. Six memory tools appear in every session automatically: `store_memory`, `search_memories`, `get_context`, `list_memories`, `delete_memory`, `export_memories`.

---

## Dashboard

```bash
pnpm dev
# Opens at http://localhost:3000
```

Five tabs:

| Tab | What it shows |
|---|---|
| Chat | Test memory-aware conversations live |
| Memory | Browse, search, edit, and delete stored memories |
| Threads | Full conversation history with memory extraction log |
| Profile | User identity and persona template selection |
| System Prompt | Preview the exact context block injected into every call |

---

## Free vs Pro

| Feature | Free (Local) | Pro (Cloud) |
|---|---|---|
| Storage | SQLite (local) | Supabase (cloud) |
| Search | FTS5 full-text | pgvector semantic |
| Extraction cost | $0 (MEMORIES_JSON parse) | $0 default |
| MCP server | Yes | Yes |
| Dashboard | Yes | Yes |
| TypeScript SDK | Yes | Yes |
| Python SDK | Yes | Yes |
| JSON / Markdown export | Yes | Yes |
| n8n community node | Yes | Yes |
| Multi-device sync | No | Yes |
| Memory summarization | No | Yes (weekly) |
| Webhook ingest | No | Yes (Slack, GitHub) |
| Health dashboard | No | Yes |
| Team workspaces | No | Team tier |
| Price | Free forever | €9/mo |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Your Application                    │
│   TypeScript SDK      Python SDK       n8n Node      │
└────────────────────────┬────────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │    Memory Engine     │
              │  ┌───────────────┐  │
              │  │  extract.ts   │  │  <- parse MEMORIES_JSON ($0)
              │  │  inject.ts    │  │  <- build system prompt
              │  │  storage.ts   │  │  <- getStorage() factory
              │  └───────┬───────┘  │
              └──────────┼──────────┘
                         │
           ┌─────────────┴──────────────┐
           │                            │
  ┌────────▼────────┐       ┌──────────▼──────────┐
  │  FREE: SQLite   │       │  PRO: Supabase       │
  │  local, offline │       │  pgvector semantic   │
  │  zero deps      │       │  multi-device sync   │
  └─────────────────┘       └─────────────────────┘
```

Every call goes through `getStorage()` — features never import SQLite or Supabase directly. Switching from local to cloud requires only one environment variable change.

---

## Memory types

| Type | What it stores | Example |
|---|---|---|
| `episodic` | What happened in past sessions | "User mentioned they prefer dark mode" |
| `semantic` | Facts and knowledge about the user | "User is a senior engineer at Stripe" |
| `preference` | How the user likes things done | "User prefers concise bullet answers" |
| `procedural` | Decisions and established workflows | "Deploy via `gcloud run deploy`" |

---

## Environment variables

### Free (local) — only these needed

```bash
OPENAI_API_KEY=sk-...                              # fallback extraction only
MEMORY_ENGINE_MODE=local                           # default
MEMORY_ENGINE_DB_PATH=~/.memory-engine/db.sqlite  # optional
MEMORY_ENGINE_USER_ID=alice                        # optional
```

### Pro (cloud) — additional

```bash
MEMORY_ENGINE_MODE=cloud
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## Export your memories

```bash
npx memory-engine export --format json > memories.json
npx memory-engine export --format markdown
npx memory-engine export --format cursor-rules   # writes .cursor/memory.md
```

---

## Commands

```bash
pnpm install          # install + auto-init SQLite schema
pnpm dev              # dashboard at localhost:3000
pnpm test             # all tests (local mode)
pnpm run mcp          # MCP server on stdio
pnpm run export       # CLI export
pnpm run cron:decay   # manual decay run
pnpm run migrate:cloud  # migrate local SQLite -> Supabase
```

---

## Contributing

```bash
git clone https://github.com/varuntyagi83/memory-engine
cd memory-engine
pnpm install
pnpm test        # all tests must pass before opening a PR
```

- Keep all database calls behind `getStorage()` — never import `better-sqlite3` or `@supabase/supabase-js` directly in feature code
- TypeScript strict mode — no `any` types
- Tests must pass for both backends: `pnpm run test:local` and `pnpm run test:cloud`
- One PR per feature from the feature spec in `docs/features/`

---

## License

MIT — [Varun Tyagi](https://meetvaruntyagi.com) · Berlin

[![Website](https://img.shields.io/badge/meetvaruntyagi.com-000?style=flat)](https://meetvaruntyagi.com)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0A66C2?style=flat)](https://linkedin.com/in/varuntyagi83)
[![GitHub](https://img.shields.io/badge/GitHub-181717?style=flat)](https://github.com/varuntyagi83)
