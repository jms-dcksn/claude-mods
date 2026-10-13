import { expect, test } from 'claude-code/testing'
import type { On, SessionContextBreakdown } from 'claude-code'

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 12,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 11 },
    view: {},
  },
} as const

const SHOW = {
  command: 'context-band',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
} as const

function breakdown(messages: number): SessionContextBreakdown {
  const used = 3000 + 12000 + 4000 + messages
  return {
    categories: [
      { name: 'System prompt', tokens: 3000, color: 'promptBorder', isDeferred: false, kind: 'used' },
      { name: 'System tools', tokens: 12000, color: 'inactive', isDeferred: false, kind: 'used' },
      { name: 'MCP tools', tokens: 4000, color: 'cyan_FOR_SUBAGENTS_ONLY', isDeferred: false, kind: 'used' },
      { name: 'Messages', tokens: messages, color: 'purple_FOR_SUBAGENTS_ONLY', isDeferred: false, kind: 'used' },
      { name: 'MCP tools (deferred)', tokens: 9000, color: 'inactive', isDeferred: true, kind: 'deferred' },
      { name: 'Autocompact buffer', tokens: 33000, color: 'inactive', isDeferred: false, kind: 'buffer' },
      { name: 'Free space', tokens: 200000 - used - 33000, color: 'promptBorder', isDeferred: false, kind: 'free' },
    ],
    totalTokens: used,
    maxTokens: 200000,
    rawMaxTokens: 200000,
    autocompactSource: 'auto',
    percentage: Math.round((used / 200000) * 100),
    gridRows: [],
    model: 'claude-opus-5-5',
    memoryFiles: [{ path: '/Users/me/.claude/CLAUDE.md', type: 'User', tokens: 1500 }],
    mcpTools: [
      { name: 'mcp__a__x', serverName: 'atlassian', tokens: 2500, isLoaded: true },
      { name: 'mcp__s__y', serverName: 'slack', tokens: 1500, isLoaded: true },
    ],
    agents: [{ agentType: 'Explore', source: 'built-in', tokens: 400 }],
    skills: { totalSkills: 60, includedSkills: 45, tokens: 3400, skillFrontmatter: [] },
    autoCompactThreshold: 167000,
    isAutoCompactEnabled: true,
    apiUsage: null,
  }
}

function fakeUsage(on: On, messages: () => number) {
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { window: 200000, breakdown: breakdown(messages()) },
      rateLimits: [],
    },
  }))
  // Stands in for the engine's own (empty) band beneath the mod.
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
}

test('draws a colour-coded bar and legend on every surface', async ($, on) => {
  fakeUsage(on, () => 20000)
  await $.command.run(SHOW)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'context-band', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: ' 20%' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Messages 20\.0k 10%$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^MCP tools \(deferred\) 9\.0k \(not loaded\)$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^█+$/ })).toBeDefined()
    await ui.unmount()
  }
})

test('updates on refresh and shows details on demand', async ($, on) => {
  let messages = 20000
  fakeUsage(on, () => messages)
  await $.command.run(SHOW)
  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })

  messages = 100000
  await $.command.run(SHOW)
  expect(await ui.find({ type: 'Text', text: ' 60%' })).toBeDefined()

  expect(await ui.find({ text: /autocompact at 167k/ })).toBeUndefined()
  await ui.press({ key: 'details' })
  expect(await ui.find({ text: /autocompact at 167k/ })).toBeDefined()
  expect(await ui.find({ text: /atlassian 2\.5k · slack 1\.5k/ })).toBeDefined()
})

test('hide removes the band and /context-band brings it back', async ($, on) => {
  fakeUsage(on, () => 20000)
  await $.command.run(SHOW)

  const ui = await $.ui.mount({ plugin: 'context-band', surface: 'terminal', ...BAND })
  await ui.press({ key: 'hide' })
  expect(await ui.find({ text: /Context/ })).toBeUndefined()

  await $.command.run(SHOW)
  expect(await ui.find({ text: /Context/ })).toBeDefined()
})
