// src/mcp/server.ts
// MCP Memory Server — exposes memory operations as MCP tools.
// Add to .cursor/mcp.json or ~/.claude.json for instant cross-tool memory.
//
// Run: pnpm run mcp
// Transport: stdio (default) | SSE on :3100

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { getStorage } from '../lib/storage'
import { buildSystemPrompt } from '../lib/inject'

const server = new Server(
  { name: 'memory-engine', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

// ── Tool definitions ──────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_memories',
      description: 'Retrieve stored memories for a user. Optionally filter by type or search query.',
      inputSchema: {
        type: 'object',
        properties: {
          user_id:  { type: 'string', description: 'User ID (default: "default")' },
          query:    { type: 'string', description: 'Search query (optional)' },
          type:     { type: 'string', enum: ['episodic','semantic','preference','procedural'], description: 'Filter by memory type' },
          limit:    { type: 'number', description: 'Max results (default: 15)' },
        },
      },
    },
    {
      name: 'store_memory',
      description: 'Store a new memory for a user.',
      inputSchema: {
        type: 'object',
        required: ['type', 'content', 'importance'],
        properties: {
          user_id:    { type: 'string' },
          type:       { type: 'string', enum: ['episodic','semantic','preference','procedural'] },
          content:    { type: 'string', description: 'The memory content' },
          importance: { type: 'number', description: '1 (trivial) to 5 (critical)' },
          session_id: { type: 'string' },
        },
      },
    },
    {
      name: 'get_user_profile',
      description: 'Get the auto-built profile for a user (name, role, tools, preferences, etc.)',
      inputSchema: {
        type: 'object',
        properties: { user_id: { type: 'string' } },
      },
    },
    {
      name: 'get_open_threads',
      description: 'Get open tasks and unfinished loops for a user.',
      inputSchema: {
        type: 'object',
        properties: { user_id: { type: 'string' } },
      },
    },
    {
      name: 'resolve_thread',
      description: 'Mark a thread/task as resolved.',
      inputSchema: {
        type: 'object',
        required: ['thread_id'],
        properties: { thread_id: { type: 'string' } },
      },
    },
    {
      name: 'get_system_prompt_block',
      description: 'Get the full memory context block ready to inject into any LLM system prompt.',
      inputSchema: {
        type: 'object',
        properties: {
          user_id:      { type: 'string' },
          max_memories: { type: 'number', description: 'Max memories to include (default: 15)' },
        },
      },
    },
  ],
}))

// ── Tool handlers ─────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params
  const storage = getStorage()
  const userId = (args?.user_id as string) ?? process.env.MEMORY_ENGINE_USER_ID ?? 'default'

  try {
    switch (name) {

      case 'get_memories': {
        const memories = args?.query
          ? await storage.searchMemories(userId, args.query as string, { type: args?.type as any, limit: (args?.limit as number) ?? 15 })
          : await storage.getMemories(userId, { type: args?.type as any, limit: (args?.limit as number) ?? 15 })
        return {
          content: [{ type: 'text', text: JSON.stringify(memories, null, 2) }]
        }
      }

      case 'store_memory': {
        const id = await storage.storeMemory({
          userId,
          type: args?.type as any,
          content: args?.content as string,
          importance: (args?.importance as any) ?? 3,
          sessionId: args?.session_id as string | undefined,
        })
        return { content: [{ type: 'text', text: JSON.stringify({ id, stored: true }) }] }
      }

      case 'get_user_profile': {
        const profile = await storage.getProfile(userId)
        return { content: [{ type: 'text', text: JSON.stringify(profile, null, 2) }] }
      }

      case 'get_open_threads': {
        const threads = await storage.getThreads(userId, ['open', 'in_progress'])
        return { content: [{ type: 'text', text: JSON.stringify(threads, null, 2) }] }
      }

      case 'resolve_thread': {
        await storage.updateThread(args?.thread_id as string, { status: 'resolved' })
        return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] }
      }

      case 'get_system_prompt_block': {
        const limit = (args?.max_memories as number) ?? 15
        const [memories, profile, threads] = await Promise.all([
          storage.getMemories(userId, { limit }),
          storage.getProfile(userId),
          storage.getThreads(userId, ['open', 'in_progress']),
        ])
        const block = buildSystemPrompt(memories, profile, threads)
        return { content: [{ type: 'text', text: block }] }
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
    }
  } catch (e) {
    return { content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true }
  }
})

// ── Start ─────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[memory-engine] MCP server running on stdio')
}

main().catch(console.error)
