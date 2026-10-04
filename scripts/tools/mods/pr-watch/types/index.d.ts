export type PrWatch = {
  number: number
  cwd: string
  update: boolean
  head: string
  reported: string[]
  errors: number
  // The shared snapshot's signature for the PR at the last full look, and when that look ran (ms).
  sig?: string
  lookedAt?: number
}

declare module 'claude-code' {
  interface PluginState {
    'pr-watch': { watches: PrWatch[] }
  }
}
