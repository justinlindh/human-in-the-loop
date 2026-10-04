export type PrWatch = {
  number: number
  cwd: string
  update: boolean
  head: string
  reported: string[]
  errors: number
}

declare module 'claude-code' {
  interface PluginState {
    'pr-watch': { watches: PrWatch[] }
  }
}
