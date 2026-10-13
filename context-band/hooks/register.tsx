import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextBreakdown } from 'claude-code'

import type { Item, Row, Snapshot } from '../types'

const snapshot = atom({ plugin: 'context-band', key: 'snapshot' } as const, null)
const isHidden = atom({ plugin: 'context-band', key: 'isHidden' } as const, false)
const isDetailed = atom({ plugin: 'context-band', key: 'isDetailed' } as const, false)

const GLYPH: Record<Row['kind'], string> = { used: '█', buffer: '▒', free: '░', deferred: '' }

// 1234 -> "1.2k", 156000 -> "156k", 1000000 -> "1.0M"
function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 100_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function pct(tokens: number, of: number): string {
  if (of <= 0) return '0%'
  const p = (tokens / of) * 100
  return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`
}

function top(items: Item[], n: number): Item[] {
  return [...items].sort((a, b) => b.tokens - a.tokens).slice(0, n)
}

function basename(path: string): string {
  const parts = path.split('/')
  return parts.slice(-2).join('/')
}

function toSnapshot(b: SessionContextBreakdown): Snapshot {
  const servers = new Map<string, number>()
  for (const t of b.mcpTools) {
    if (t.isLoaded) servers.set(t.serverName, (servers.get(t.serverName) ?? 0) + t.tokens)
  }
  return {
    totalTokens: b.totalTokens,
    maxTokens: b.rawMaxTokens,
    percentage: b.percentage,
    model: b.model,
    autoCompactAt: b.isAutoCompactEnabled ? (b.autoCompactThreshold ?? null) : null,
    rows: b.categories.map(c => ({ name: c.name, tokens: c.tokens, color: c.color, kind: c.kind })),
    mcpServers: [...servers].map(([label, tokens]) => ({ label, tokens })),
    memoryFiles: b.memoryFiles.map(f => ({ label: `${basename(f.path)} (${f.type})`, tokens: f.tokens })),
    skills: b.skills
      ? { listed: b.skills.includedSkills, total: b.skills.totalSkills, tokens: b.skills.tokens }
      : null,
    agents: { count: b.agents.length, tokens: b.agents.reduce((s, a) => s + a.tokens, 0) },
  }
}

// Split `width` cells across the rows in proportion to their tokens
// (largest remainder), so the bar always fills exactly `width`.
function cells(rows: Row[], width: number): number[] {
  const sum = rows.reduce((s, r) => s + r.tokens, 0)
  if (sum <= 0) return rows.map(() => 0)
  const exact = rows.map(r => (r.tokens / sum) * width)
  // A row that holds any tokens gets at least one cell, so small ones stay visible.
  const out = exact.map((x, i) => Math.max(Math.floor(x), (rows[i]?.tokens ?? 0) > 0 ? 1 : 0))
  let left = width - out.reduce((s, c) => s + c, 0)
  const order = exact
    .map((x, i) => ({ i, rest: x - Math.floor(x) }))
    .sort((a, b) => b.rest - a.rest)
  for (const { i } of order) {
    if (left <= 0) break
    out[i] = (out[i] ?? 0) + 1
    left -= 1
  }
  // Too many minimum cells: take back from the widest rows.
  while (left < 0) {
    const widest = out.indexOf(Math.max(...out))
    out[widest] = (out[widest] ?? 1) - 1
    left += 1
  }
  return out
}

// One refresh at a time; calls that arrive meanwhile fold into one more pass.
let isBusy = false
let isAgain = false

async function refresh($: EngineInterface): Promise<void> {
  if (isBusy) {
    isAgain = true
    return
  }
  isBusy = true
  try {
    do {
      isAgain = false
      const usage = await $.session.usage({ breakdown: 'summary' })
      const b = usage.context.breakdown
      if (b) await update($, snapshot, () => toSnapshot(b))
    } while (isAgain)
  } finally {
    isBusy = false
  }
}

function background($: EngineInterface): void {
  refresh($).catch(err => $.ui.log(`context-band: ${String(err)}`, { to: 'debug' }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'context-band',
      description: 'Show the context usage band again and refresh it',
    })
    const started = await next(e)
    background($)
    return started
  })

  on('command.run', { command: 'context-band' }, async $ => {
    await update($, isHidden, () => false)
    await refresh($)
    return { text: 'Context band shown and refreshed.' }
  })

  // Each main-thread model response moves the Messages row: refresh after it.
  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    if (e.agentId === undefined) background($)
    return r
  })

  // Tool results land in the window as Claude works.
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    background($)
    return r
  }).catch(($, e, next) => next(e))

  on('session.measure', ($, e, next) => {
    if (e.changed.includes('context')) background($)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const snap = await read($, snapshot)
    if (e.props.hasSurvey || snap === null || (await read($, isHidden))) {
      return next(e)
    }
    const detailed = await read($, isDetailed)
    const { Box, Button, Text } = $.ui.resolve(e)

    const inBar = snap.rows.filter(r => r.kind !== 'deferred')
    const scale = Math.max(snap.maxTokens, snap.totalTokens)
    // "Context " + bar + " 100% 999k/1.0M " + buttons
    const width = Math.max(10, Math.min(100, e.props.bodyColumns - 44))
    const widths = cells(inBar, width)
    const level = snap.percentage >= 85 ? 'error' : snap.percentage >= 70 ? 'warning' : 'success'

    const legend = snap.rows.filter(r => r.tokens > 0 || r.kind === 'free')
    const mcp = top(snap.mcpServers, 4)
    const memory = top(snap.memoryFiles, 3)

    const mine = (
      <Box flexDirection="column">
        <Box>
          <Text bold>Context </Text>
          {inBar.map((r, i) => {
            const n = widths[i] ?? 0
            return n > 0 ? <Text color={r.color}>{GLYPH[r.kind].repeat(n)}</Text> : null
          })}
          <Text color={level} bold> {snap.percentage}%</Text>
          <Text dimColor> {fmt(snap.totalTokens)}/{fmt(snap.maxTokens)} </Text>
          <Button
            key="details"
            label={detailed ? 'Less' : 'Details'}
            onPress={() => update($, isDetailed, v => !v)}
          />
          <Text> </Text>
          <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
        </Box>
        <Box flexWrap="wrap" columnGap={2}>
          {legend.map(r => (
            <Box>
              <Text color={r.color}>{r.kind === 'deferred' ? '◌' : '■'} </Text>
              <Text dimColor={r.kind !== 'used'}>
                {r.name} {fmt(r.tokens)}
                {r.kind === 'deferred' ? ' (not loaded)' : ` ${pct(r.tokens, scale)}`}
              </Text>
            </Box>
          ))}
        </Box>
        {detailed && (
          <Box flexDirection="column">
            <Text dimColor wrap="truncate-end">
              {snap.model}
              {snap.autoCompactAt !== null
                ? ` · autocompact at ${fmt(snap.autoCompactAt)} (${fmt(Math.max(0, snap.autoCompactAt - snap.totalTokens))} left)`
                : ' · autocompact off'}
            </Text>
            {mcp.length > 0 && (
              <Text wrap="truncate-end">
                <Text bold>MCP </Text>
                {mcp.map(s => `${s.label} ${fmt(s.tokens)}`).join(' · ')}
              </Text>
            )}
            {memory.length > 0 && (
              <Text wrap="truncate-end">
                <Text bold>Memory </Text>
                {memory.map(m => `${m.label} ${fmt(m.tokens)}`).join(' · ')}
              </Text>
            )}
            <Text wrap="truncate-end">
              {snap.skills !== null && (
                <Text>
                  <Text bold>Skills </Text>
                  {snap.skills.listed}/{snap.skills.total} listed {fmt(snap.skills.tokens)}
                  {'  '}
                </Text>
              )}
              <Text bold>Agents </Text>
              {snap.agents.count} {fmt(snap.agents.tokens)}
            </Text>
          </Box>
        )}
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
