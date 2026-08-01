import { philosophyDisplayNames } from '@wealth/schemas'

// Terminal rendering. Everything here is derived from validated artifacts —
// never from transcript text — per the "assert on artifact contents" rule.

export function shortId(taskId) {
  return taskId.slice(0, 8)
}

function money(amount, { decimals = 2 } = {}) {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function table(headers, rows) {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => String(row[index]).length)),
  )
  const line = (cells) =>
    '  ' +
    cells
      .map((cell, index) => String(cell).padEnd(widths[index] + 2))
      .join('')
      .trimEnd()
  return [line(headers), ...rows.map(line)].join('\n')
}

export function renderBanner(agents, { ports = false } = {}) {
  const lines = ['Wealth Orchestrator v1.0 — connected agents:']
  const parts = Object.values(agents).map((agent) => {
    const where = ports
      ? ` ${new URL(agent.url).port ? `:${new URL(agent.url).port}` : ''}`
      : ''
    return agent.status === 'online'
      ? `✔ ${agent.name}${where}`
      : `✘ ${agent.name}${where} unreachable — ${agent.reason}`
  })
  lines.push(parts.join('   '))
  return lines.join('\n')
}

export function renderPortfolio(portfolio, warnings = []) {
  const rows = portfolio.holdings.map((holding) => {
    const quantity = holding.lots.reduce((sum, lot) => sum + lot.quantity, 0)
    const avgCost =
      holding.lots.reduce((sum, lot) => sum + lot.quantity * lot.costBasis, 0) /
      quantity
    return [
      holding.accountId,
      holding.accountType,
      holding.symbol,
      holding.lots.length,
      quantity,
      `$${money(avgCost)}`,
    ]
  })
  const lines = [
    table(['Account', 'Type', 'Symbol', 'Lots', 'Qty', 'Avg cost'], rows),
  ]
  for (const cash of portfolio.uninvestedCash) {
    lines.push(
      `\n  Uninvested cash: $${money(cash.amount)} (${cash.accountId})`,
    )
  }
  if (warnings.length === 0) {
    lines.push('  All lots have purchase dates — no follow-ups expected.')
  } else {
    for (const warning of warnings) lines.push(`  ⚠ ${warning}`)
  }
  return lines.join('\n')
}

export function renderAllocation(allocation) {
  const displayName =
    philosophyDisplayNames[allocation.philosophy] ?? allocation.philosophy
  const rows = allocation.targets.map((target) => [
    target.assetClass,
    `${target.weightPct}%`,
    target.preferredVehicles.join(' · '),
  ])
  return [
    `  Target allocation — "${displayName}"`,
    table(['Asset class', 'Weight', 'Preferred vehicles'], rows),
  ].join('\n')
}

export function renderPlan(plan) {
  const rows = plan.actions.map((action) => [
    action.type.toUpperCase(),
    action.accountId,
    action.symbol,
    action.lotId ?? '—',
    action.quantity,
    action.reason,
  ])
  const lines = [
    table(['Action', 'Account', 'Symbol', 'Lot', 'Qty', 'Reason'], rows),
    '',
    `  Estimated tax savings: $${money(plan.estimatedTaxSavings)}`,
    plan.washSaleWarnings.length === 0
      ? '  Wash-sale warnings: none'
      : `  Wash-sale warnings:\n${plan.washSaleWarnings.map((warning) => `    ⚠ ${warning}`).join('\n')}`,
  ]
  return lines.join('\n')
}

export function renderTaskTree(registry, remoteTasks) {
  const lines = []
  for (const contextId of registry.contexts()) {
    lines.push(contextId)
    const entries = registry.byContext(contextId)
    entries.forEach((entry, index) => {
      const connector = index === entries.length - 1 ? '└──' : '├──'
      const remote = (remoteTasks?.[entry.agent] ?? []).find(
        (task) => task.id === entry.taskId,
      )
      const drift =
        remoteTasks && remote && remote.status.state !== entry.state
          ? '  (!) registry/agent state mismatch'
          : remoteTasks && !remote
            ? '  (!) not found on agent'
            : ''
      lines.push(
        `${connector} ${registry.describe(entry.taskId)}   ${entry.artifactName ?? ''}${drift}`.trimEnd(),
      )
    })
  }
  return lines.length > 0 ? lines.join('\n') : 'No tasks yet.'
}

export function renderAgents(agents) {
  return Object.values(agents)
    .map((agent) => {
      const port = new URL(agent.url).port
      return agent.status === 'online'
        ? `✔ ${agent.name} :${port} (${agent.card.name})`
        : `✘ ${agent.name} :${port} unreachable — ${agent.reason}`
    })
    .join('\n')
}
