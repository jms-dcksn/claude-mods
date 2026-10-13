import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const NOW = Date.parse('2026-10-13T17:00:00.000Z')

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 9 },
    view: {},
  },
} as const

const SHOW = {
  command: 'uip-auth',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
} as const

function status(data: Record<string, unknown>): string {
  return JSON.stringify({ Result: 'Success', Code: 'LoginStatus', Data: data })
}

const LOGGED_IN = status({
  Status: 'Logged in',
  BaseUrl: 'https://staging.uipath.com',
  Organization: 'uipathstgSS_updated',
  Tenant: 'UiPathDefault',
  ExpirationDate: '2026-10-13T18:46:00.000Z',
})

function fakeUip(on: On, stdout: () => string, calls: string[][] = []) {
  // Stands in for the engine's own (empty) band beneath the mod.
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('process.run', (_$, e) => {
    calls.push([...e.argv])
    return {
      value: {
        exitCode: 0,
        stdout: stdout(),
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
}

test('shows org, tenant, env and expiry on every surface', async ($, on) => {
  mock.clock(on, { now: NOW })
  const calls: string[][] = []
  fakeUip(on, () => LOGGED_IN, calls)
  await $.command.run(SHOW)

  expect(calls[0]).toEqual(['uip', 'login', 'status', '--output', 'json'])
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'uip-auth-band', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: 'uipathstgSS_updated / UiPathDefault' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /staging · exp \d\d:\d\d/ })).toBeDefined()
    await ui.unmount()
  }
})

test('warns near expiry and flags logged out', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  let out = LOGGED_IN
  fakeUip(on, () => out)
  await $.command.run(SHOW)

  await clock.set(Date.parse('2026-10-13T18:40:00.000Z'))
  const ui = await $.ui.mount({ plugin: 'uip-auth-band', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /expires in 6 min/ })).toBeDefined()

  out = status({ Status: 'Logged out' })
  await ui.press({ key: 'refresh' })
  expect(await ui.find({ type: 'Text', text: 'not logged in' })).toBeDefined()
})

test('hide removes the band and /uip-auth brings it back', async ($, on) => {
  mock.clock(on, { now: NOW })
  fakeUip(on, () => LOGGED_IN)
  await $.command.run(SHOW)

  const ui = await $.ui.mount({ plugin: 'uip-auth-band', surface: 'terminal', ...BAND })
  await ui.press({ key: 'hide' })
  expect(await ui.find({ text: /UiPathDefault/ })).toBeUndefined()

  await $.command.run(SHOW)
  expect(await ui.find({ text: /UiPathDefault/ })).toBeDefined()
})
