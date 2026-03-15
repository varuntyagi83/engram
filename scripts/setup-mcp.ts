// scripts/setup-mcp.ts
// Generates MCP config for Cursor and Claude Code.
// Run: pnpm run mcp:setup

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

function run(): void {
  const platform = os.platform()
  const projectRoot = process.cwd()
  const serverPath = path.join(projectRoot, 'src', 'mcp', 'server.ts')

  console.log(`[setup-mcp] Platform : ${platform}`)
  console.log(`[setup-mcp] Project  : ${projectRoot}`)
  console.log(`[setup-mcp] MCP server: ${serverPath}`)

  // --- Write .cursor/mcp.json ---
  const cursorDir = path.join(projectRoot, '.cursor')
  if (!fs.existsSync(cursorDir)) {
    fs.mkdirSync(cursorDir, { recursive: true })
  }

  const cursorConfig = {
    mcpServers: {
      'memory-engine': {
        command: 'pnpm',
        args: ['run', 'mcp'],
        cwd: projectRoot
      }
    }
  }

  const cursorConfigPath = path.join(cursorDir, 'mcp.json')
  fs.writeFileSync(cursorConfigPath, JSON.stringify(cursorConfig, null, 2) + '\n', 'utf-8')
  console.log(`[setup-mcp] Written  : ${cursorConfigPath}`)

  // --- Print Claude Code instructions ---
  const claudeSnippet = JSON.stringify(
    {
      'memory-engine': {
        command: 'pnpm',
        args: ['run', 'mcp'],
        cwd: projectRoot
      }
    },
    null,
    2
  )

  console.log('\n--- Claude Code setup ---')
  console.log('Add this to ~/.claude.json under "mcpServers":')
  console.log(claudeSnippet)
  console.log('-------------------------\n')

  console.log('[setup-mcp] Done. MCP configuration generated successfully.')
}

run()
