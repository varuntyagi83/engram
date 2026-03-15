# Memory Engine

**Local-first persistent memory for AI agents.**
Free forever. No account. No cloud. Just one API key.

```bash
npm install memory-engine-sdk
```

```typescript
import { MemoryEngine } from 'memory-engine-sdk'

const me = new MemoryEngine({ userId: 'varun' })

// Before your OpenAI/any LLM call — injects memory context
const messages = await me.before(conversationHistory)
const reply = await openai.chat.completions.create({ model: 'gpt-4o', messages })

// After — extracts + stores new memories (non-blocking, $0 cost)
me.after(reply.choices[0].message.content)
```

---

## How it works

Every turn, the engine:
1. **Retrieves** relevant memories from local SQLite and builds a context block
2. **Injects** it into your system prompt automatically
3. **Extracts** new facts from the LLM response via the MEMORIES_JSON pattern
4. **Stores** them with type classification, importance, and decay scoring

Four memory types keep the store clean and searchable:

| Type | What it stores | Example |
|---|---|---|
| `procedural` | Decisions + workflows | "Uses sundaybi GCP project" |
| `semantic` | Facts + beliefs | "Prefers FastAPI over Flask" |
| `preference` | How they like things | "Wants code first, explanation after" |
| `episodic` | What happened | "Discussed BigQuery optimisation" |

---

## MCP setup (Cursor + Claude Code)

Add to `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "memory-engine": {
      "command": "npx",
      "args": ["memory-engine", "mcp"],
      "env": { "OPENAI_API_KEY": "sk-..." }
    }
  }
}
```

Add to `~/.claude.json` (Claude Code):
```json
{
  "mcpServers": {
    "memory-engine": {
      "command": "npx",
      "args": ["memory-engine", "mcp"],
      "env": { "OPENAI_API_KEY": "sk-..." }
    }
  }
}
```

Restart. Memory tools appear in every session automatically.

---

## Dashboard

```bash
npx memory-engine dashboard
# Opens at http://localhost:3000
```

View, search, edit memories. See exactly what gets injected. Track open tasks.

---

## Python SDK

```bash
pip install memory-engine-sdk
```

```python
from memory_engine import MemoryEngine

me = MemoryEngine(user_id="varun")
messages = await me.before(conversation_history)
response = await call_any_llm(messages)
await me.after(response)
```

LangChain:
```python
from memory_engine.langchain import MemoryEngineMemory
chain = ConversationChain(llm=llm, memory=MemoryEngineMemory(user_id="varun"))
```

---

## Export your data

```bash
npx memory-engine export --format json > memories.json
npx memory-engine export --format markdown
npx memory-engine export --format cursor-rules  # writes .cursor/memory.md
```

---

## Free vs Pro

| | Free (local) | Pro (€9/mo) |
|---|---|---|
| SQLite local storage | ✓ | ✓ |
| All 4 memory types | ✓ | ✓ |
| MCP (Cursor + Claude Code) | ✓ | ✓ |
| TypeScript + Python SDK | ✓ | ✓ |
| Memory dashboard | ✓ | ✓ |
| Decay + deduplication | ✓ | ✓ |
| JSON / Markdown export | ✓ | ✓ |
| n8n community node | ✓ | ✓ |
| Cloud sync (multi-device) | — | ✓ |
| Semantic search (pgvector) | — | ✓ |
| Memory summarization | — | ✓ |
| Webhook ingest (Slack, GitHub) | — | ✓ |
| Health dashboard | — | ✓ |
| Team workspaces | — | Team |

---

## Architecture

```
Your app  ──  Cursor  ──  Claude Code  ──  n8n
     └─────────────────┬──────────────────┘
                       │  me.before() / me.after()
                       │  MCP tools
              ┌────────▼────────┐
              │  Memory Engine  │
              │  extract → store│
              │  retrieve → inject│
              └────────┬────────┘
                       │  StorageAdapter
           ┌───────────┴────────────┐
           │                        │
     ┌─────▼─────┐          ┌──────▼──────┐
     │  SQLite   │          │  Supabase   │
     │  (local)  │          │  pgvector   │
     │  free ✓   │          │  Pro €9/mo  │
     └───────────┘          └─────────────┘
```

---

## Built by
[Varun Tyagi](https://meetvaruntyagi.com) · Director of Data · Berlin

[![Website](https://img.shields.io/badge/meetvaruntyagi.com-000?style=flat)](https://meetvaruntyagi.com)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0A66C2?style=flat)](https://linkedin.com/in/varuntyagi83)
[![GitHub](https://img.shields.io/badge/GitHub-181717?style=flat)](https://github.com/varuntyagi83)
[![Medium](https://img.shields.io/badge/Medium-000?style=flat)](https://medium.com/@varun.tyagi83)

---

MIT License
