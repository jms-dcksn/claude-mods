import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { UipAuth } from '../types'

const auth = atom({ plugin: 'uip-auth-band', key: 'auth' } as const, null)
const isHidden = atom({ plugin: 'uip-auth-band', key: 'isHidden' } as const, false)

const WARN_MS = 15 * 60 * 1000

// "https://staging.uipath.com" -> "staging"
function envOf(baseUrl: unknown): string {
  if (typeof baseUrl !== 'string') return '?'
  try {
    return new URL(baseUrl).hostname.split('.')[0] ?? '?'
  } catch {
    return '?'
  }
}

function parse(stdout: string): UipAuth {
  let json: { Data?: Record<string, unknown> }
  try {
    json = JSON.parse(stdout)
  } catch {
    return { kind: 'error', message: 'unreadable output' }
  }
  const data = json.Data
  if (!data || data.Status !== 'Logged in') return { kind: 'loggedOut' }
  const expiresAt =
    typeof data.ExpirationDate === 'string' ? Date.parse(data.ExpirationDate) : NaN
  return {
    kind: 'ok',
    org: String(data.Organization ?? '?'),
    tenant: String(data.Tenant ?? '?'),
    env: envOf(data.BaseUrl),
    expiresAt: Number.isNaN(expiresAt) ? null : expiresAt,
  }
}

async function refresh($: EngineInterface): Promise<void> {
  let next: UipAuth
  try {
    const ran = await $.process.run(['uip', 'login', 'status', '--output', 'json'], {
      timeoutMs: 10_000,
    })
    next = parse(ran.stdout)
  } catch {
    next = { kind: 'missing' }
  }
  await update($, auth, () => next)
}

function background($: EngineInterface): void {
  refresh($).catch(err => $.ui.log(`uip-auth-band: ${String(err)}`, { to: 'debug' }))
}

function clock(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'uip-auth',
      description: 'Show the UiPath auth band again and re-check uip login status',
    })
    const started = await next(e)
    background($)
    return started
  })

  on('command.run', { command: 'uip-auth' }, async $ => {
    await update($, isHidden, () => false)
    await refresh($)
    return { text: 'UiPath auth band shown and refreshed.' }
  })

  // Re-check after any shell command that runs the uip CLI (login, logout, tenant switch).
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (/(^|[\s;&|(])uip\s/.test(e.command)) background($)
    return ran
  }).catch(($, e, next) => next(e))

  // Re-check after each turn to catch a login done in another terminal.
  on('turn.complete', ($, e, next) => {
    background($)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const state = await read($, auth)
    if (e.props.hasSurvey || state === null || (await read($, isHidden))) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const now = await $.clock.now()

    let dot: 'success' | 'warning' | 'error' | 'subtle' = 'success'
    let main = ''
    let detail = ''
    let detailColor: 'subtle' | 'warning' | 'error' = 'subtle'

    if (state.kind === 'ok') {
      main = `${state.org} / ${state.tenant}`
      detail = state.env
      if (state.expiresAt !== null) {
        const left = state.expiresAt - now
        if (left <= 0) {
          dot = 'error'
          detailColor = 'error'
          detail += ' · token expired'
        } else if (left < WARN_MS) {
          dot = 'warning'
          detailColor = 'warning'
          detail += ` · expires in ${Math.ceil(left / 60000)} min`
        } else {
          detail += ` · exp ${clock(state.expiresAt)}`
        }
      }
    } else if (state.kind === 'loggedOut') {
      dot = 'error'
      main = 'not logged in'
      detail = 'run: uip login'
    } else if (state.kind === 'missing') {
      dot = 'subtle'
      main = 'uip CLI not found'
    } else {
      dot = 'error'
      main = 'status check failed'
      detail = state.message
    }

    const mine = (
      <Box>
        <Text color={dot}>● </Text>
        <Text bold>UiPath </Text>
        <Text wrap="truncate-end">
          {main}
        </Text>
        {detail !== '' && <Text color={detailColor}>  {detail}</Text>}
        <Text> </Text>
        <Button key="refresh" label="Refresh" onPress={() => refresh($)} />
        <Text> </Text>
        <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
      </Box>
    )

    // The band has one instance: keep whatever another mod draws there below ours.
    const below = await next(e)
    return (
      <Box flexDirection="column">
        {mine}
        {below}
      </Box>
    )
  })
}
