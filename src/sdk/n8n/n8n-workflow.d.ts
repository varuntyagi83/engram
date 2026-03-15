// src/sdk/n8n/n8n-workflow.d.ts
// Minimal ambient type declarations for n8n-workflow.
// This allows `import type` from 'n8n-workflow' in MemoryEngine.node.ts
// without adding n8n-workflow as a runtime or dev dependency.
// The full package is only needed when the node is loaded inside an actual n8n instance.

declare module 'n8n-workflow' {
  export type NodePropertyTypes =
    | 'boolean'
    | 'collection'
    | 'color'
    | 'dateTime'
    | 'fixedCollection'
    | 'hidden'
    | 'json'
    | 'notice'
    | 'multiOptions'
    | 'number'
    | 'options'
    | 'string'
    | 'credentialsSelect'
    | 'resourceLocator'
    | 'resourceMapper'
    | 'filter'
    | 'assignmentCollection'

  export interface INodePropertyOptions {
    name        : string
    value       : string | number | boolean
    description?: string
    action?     : string
  }

  export interface IDisplayOptions {
    show?: Record<string, Array<string | number | boolean>>
    hide?: Record<string, Array<string | number | boolean>>
  }

  export interface INodeProperty {
    displayName     : string
    name            : string
    type            : NodePropertyTypes
    default         : unknown
    description?    : string
    options?        : INodePropertyOptions[]
    displayOptions? : IDisplayOptions
    noDataExpression?: boolean
    required?       : boolean
  }

  export interface INodeCredentialDescription {
    name     : string
    required?: boolean
  }

  export interface INodeTypeDescription {
    displayName  : string
    name         : string
    group        : string[]
    version      : number
    description  : string
    defaults     : { name: string }
    inputs       : string[]
    outputs      : string[]
    credentials? : INodeCredentialDescription[]
    properties   : INodeProperty[]
  }

  export interface INodeExecutionData {
    json: Record<string, unknown>
  }

  export interface IDataObject {
    [key: string]: unknown
  }

  export interface IHttpRequestOptions {
    method  : 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    url     : string
    headers?: Record<string, string>
    body?   : string | IDataObject
    json?   : boolean
  }

  export interface IExecuteFunctionsHelpers {
    httpRequest(opts: IHttpRequestOptions): Promise<unknown>
  }

  export interface IExecuteFunctions {
    getInputData(): INodeExecutionData[]
    getNodeParameter(name: string, itemIndex: number, fallback?: unknown): unknown
    getCredentials(name: string): Promise<Record<string, unknown>>
    helpers: IExecuteFunctionsHelpers
  }

  export interface INodeType {
    description: INodeTypeDescription
    execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]>
  }
}
