export type UipAuth =
  | { kind: 'ok'; org: string; tenant: string; env: string; expiresAt: number | null }
  | { kind: 'loggedOut' }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }

declare module 'claude-code' {
  interface PluginState {
    'uip-auth-band': { auth: UipAuth | null; isHidden: boolean }
  }
}
