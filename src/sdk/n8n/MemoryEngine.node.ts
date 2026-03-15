// src/sdk/n8n/MemoryEngine.node.ts
// n8n community node for Memory Engine.
//
// Install via n8n community nodes panel:
//   Package name: memory-engine-n8n (or point to local path during development)
//
// Supported operations:
//   retrieve — fetch memories + profile + system prompt block for the given user
//   store    — extract and store memories from an LLM response text
//
// n8n-workflow is a dev-only type dep — use `import type` only, never a runtime import.

import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow'

export class MemoryEngineNode implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Memory Engine',
    name: 'memoryEngine',
    group: ['transform'],
    version: 1,
    description: 'Store and retrieve persistent memories for AI agents',
    defaults: { name: 'Memory Engine' },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      {
        name: 'memoryEngineApi',
        required: false,
      },
    ],
    properties: [
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        options: [
          { name: 'Retrieve', value: 'retrieve', description: 'Get memories + profile + system prompt block' },
          { name: 'Store',    value: 'store',    description: 'Extract and store memories from LLM response' },
        ],
        default: 'retrieve',
        noDataExpression: true,
      },
      {
        displayName: 'User ID',
        name: 'userId',
        type: 'string',
        default: 'default',
        description: 'The user whose memories to retrieve or store',
      },
      {
        displayName: 'Query',
        name: 'query',
        type: 'string',
        default: '',
        description: 'Optional search query for Retrieve operation',
        displayOptions: { show: { operation: ['retrieve'] } },
      },
      {
        displayName: 'LLM Response',
        name: 'llmResponse',
        type: 'string',
        default: '',
        description: 'Raw LLM response text to extract memories from',
        displayOptions: { show: { operation: ['store'] } },
      },
    ],
  }

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items    = this.getInputData()
    const operation = this.getNodeParameter('operation', 0) as string
    const userId   = this.getNodeParameter('userId', 0) as string

    // Credentials are optional — fall back to localhost defaults
    let baseUrl = 'http://localhost:3000'
    let apiKey  = ''
    try {
      const creds = await this.getCredentials('memoryEngineApi')
      baseUrl = (creds.url as string)    || baseUrl
      apiKey  = (creds.apiKey as string) || ''
    } catch { /* no credentials configured — use defaults */ }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

    const results: INodeExecutionData[] = []

    for (let i = 0; i < items.length; i++) {
      if (operation === 'retrieve') {
        const query = this.getNodeParameter('query', i, '') as string

        // GET /api/memory/inject — returns the system prompt block
        const injectUrl = `${baseUrl}/api/memory/inject?userId=${encodeURIComponent(userId)}`
        const injectRes = await this.helpers.httpRequest({ method: 'GET', url: injectUrl, headers }) as {
          systemPromptBlock?: string
          tokenCount?: number
        }

        // GET /api/memory — returns raw memories (optional query filter)
        const memUrl = query
          ? `${baseUrl}/api/memory?userId=${encodeURIComponent(userId)}&search=${encodeURIComponent(query)}&limit=15`
          : `${baseUrl}/api/memory?userId=${encodeURIComponent(userId)}&limit=15`
        const memRes = await this.helpers.httpRequest({ method: 'GET', url: memUrl, headers })

        results.push({
          json: {
            memories:          memRes,
            profile:           {},
            systemPromptBlock: injectRes.systemPromptBlock ?? '',
            tokenCount:        injectRes.tokenCount        ?? 0,
          },
        })
      } else if (operation === 'store') {
        const llmResponse = this.getNodeParameter('llmResponse', i, '') as string

        // POST /api/memory — store a single memory derived from the LLM response
        const storeUrl = `${baseUrl}/api/memory`
        const storeRes = await this.helpers.httpRequest({
          method  : 'POST',
          url     : storeUrl,
          headers,
          body    : JSON.stringify({
            userId,
            type       : 'episodic',
            content    : llmResponse.slice(0, 500),
            importance : 2,
          }),
        }) as { id?: string }

        results.push({ json: { memoriesStored: 1, id: storeRes.id } })
      }
    }

    return [results]
  }
}
