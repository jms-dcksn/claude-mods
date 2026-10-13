export type Row = {
  name: string
  tokens: number
  color: string
  kind: 'used' | 'free' | 'buffer' | 'deferred'
}

export type Item = { label: string; tokens: number }

export type Snapshot = {
  totalTokens: number
  maxTokens: number
  percentage: number
  model: string
  autoCompactAt: number | null
  rows: Row[]
  mcpServers: Item[]
  memoryFiles: Item[]
  skills: { listed: number; total: number; tokens: number } | null
  agents: { count: number; tokens: number }
}

declare module 'claude-code' {
  interface PluginState {
    'context-band': { snapshot: Snapshot | null; isHidden: boolean; isDetailed: boolean }
  }
}
