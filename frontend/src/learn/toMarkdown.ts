/**
 * Serialize Learn topics to plain Markdown for AI tools and non-JS fetchers.
 * Diagrams are omitted (visual-only); text scenarios/scoreboards are included.
 */
import type { LearnTopic, WorkedExample, WorkedScenario } from './types'
import { learnKindToPath, learnTopicPath } from './routing'

function bullets(lines: string[]): string {
  return lines.map((l) => `- ${l}`).join('\n')
}

function kvTable(rows: { label: string; value: string }[]): string {
  if (!rows.length) return ''
  const body = rows.map((r) => `| ${escapeCell(r.label)} | ${escapeCell(r.value)} |`).join('\n')
  return `| | |\n| --- | --- |\n${body}`
}

function escapeCell(s: string): string {
  return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function scenarioToMd(s: WorkedScenario): string {
  const parts: string[] = [`### ${s.title}`, '', s.narrative, '']
  if (s.setup?.length) {
    parts.push('**Setup**', '', kvTable(s.setup), '')
  }
  if (s.timeline?.length) {
    parts.push('**Timeline**', '')
    for (const row of s.timeline) {
      const bits = [row.label]
      if (row.ohlc) bits.push(`OHLC ${row.ohlc}`)
      if (row.close) bits.push(`close ${row.close}`)
      if (row.high) bits.push(`high ${row.high}`)
      if (row.low) bits.push(`low ${row.low}`)
      if (row.note) bits.push(`— ${row.note}`)
      parts.push(`- ${bits.join(' · ')}`)
    }
    parts.push('')
  }
  if (s.scoreboards?.length) {
    for (const board of s.scoreboards) {
      parts.push(`**${board.label}**`, '')
      parts.push(
        '| Metric | Value |',
        '| --- | --- |',
        ...board.rows.map((r) => `| ${escapeCell(r.metric)} | ${escapeCell(r.value)} |`),
        '',
      )
    }
  }
  if (s.steps?.length) {
    parts.push('**Steps**', '', bullets(s.steps), '')
  }
  if (s.rulesVsMeasurements) {
    parts.push('**Rules**', '', bullets(s.rulesVsMeasurements.rules), '')
    parts.push('**Measurements**', '', bullets(s.rulesVsMeasurements.measurements), '')
  }
  parts.push(`**Result:** ${s.result}`, '')
  return parts.join('\n')
}

function exampleToMd(ex: WorkedExample): string {
  const parts: string[] = ['## Worked example', '', ex.narrative, '']
  if (ex.periodNote) parts.push(`*${ex.periodNote}*`, '')
  if (ex.inputs?.length) {
    parts.push('**Inputs**', '', kvTable(ex.inputs), '')
  }
  if (ex.steps?.length) {
    parts.push('**Steps**', '', bullets(ex.steps), '')
  }
  parts.push(`**Result:** ${ex.result}`, '')
  if (ex.scenarios?.length) {
    parts.push('## Scenarios', '')
    for (const s of ex.scenarios) {
      parts.push(scenarioToMd(s))
    }
  }
  return parts.join('\n')
}

/** Relative path under learn-export/, e.g. patterns/breakout.md */
export function topicExportRelPath(topic: LearnTopic): string {
  return `${learnKindToPath(topic.kind)}/${topic.slug}.md`
}

/** Absolute site path for static export, e.g. /learn-export/patterns/breakout.md */
export function topicExportUrl(topic: LearnTopic): string {
  return `/learn-export/${topicExportRelPath(topic)}`
}

export function topicToMarkdown(topic: LearnTopic, opts?: { baseUrl?: string }): string {
  const spaPath = learnTopicPath(topic.kind, topic.slug)
  const base = (opts?.baseUrl || '').replace(/\/$/, '')
  const spaUrl = base ? `${base}${spaPath}` : spaPath
  const mdUrl = base ? `${base}${topicExportUrl(topic)}` : topicExportUrl(topic)

  const parts: string[] = [
    `# ${topic.title}`,
    '',
    `> **Kind:** ${topic.kind} · **Slug:** \`${topic.slug}\` · **Group:** ${topic.group}` +
      (topic.direction ? ` · **Direction:** ${topic.direction}` : ''),
    '>',
    `> SPA: ${spaUrl}  `,
    `> Markdown: ${mdUrl}`,
    '',
    topic.shortDescription,
    '',
    '---',
    '',
    '## Plain English',
    '',
    bullets(topic.plainEnglish),
    '',
  ]

  if (topic.questionsItSolves?.length) {
    parts.push('## Questions this answers', '', bullets(topic.questionsItSolves), '')
  }
  if (topic.howToUse?.length) {
    parts.push('## How to use it in TIP', '', bullets(topic.howToUse), '')
  }

  parts.push(
    '## How TIP calculates it',
    '',
    bullets(topic.howWeCalculate),
    '',
    '## Formula (plain)',
    '',
    topic.formulaPlain,
    '',
    '## Formula (formal)',
    '',
    '```',
    topic.formulaFormal,
    '```',
    '',
  )

  if (topic.lifecycle?.length) {
    parts.push('## Lifecycle', '', bullets(topic.lifecycle), '')
  }

  parts.push(exampleToMd(topic.workedExample))

  if (topic.tipParameters?.length) {
    parts.push(
      '## TIP parameters (defaults)',
      '',
      '| Name | Value | Config key | Notes |',
      '| --- | --- | --- | --- |',
      ...topic.tipParameters.map(
        (p) =>
          `| ${escapeCell(p.name)} | ${escapeCell(p.value)} | \`${escapeCell(p.configKey)}\` | ${escapeCell(p.notes || (p.advanced ? 'advanced' : ''))} |`,
      ),
      '',
    )
  }

  parts.push(
    '## Flags',
    '',
    `- Plotted on chart: ${topic.plottedOnChart ? 'yes' : 'no'}`,
    `- Closed candle only: ${topic.closedCandleOnly ? 'yes' : 'no'}`,
  )
  if (topic.indexVolumeNote) {
    parts.push(`- Index volume note: ${topic.indexVolumeNote}`)
  }
  if (topic.patternTypeId) {
    parts.push(`- Pattern type id: \`${topic.patternTypeId}\``)
  }
  if (topic.detectorVersionHint) {
    parts.push(`- Detector version hint: ${topic.detectorVersionHint}`)
  }
  parts.push('')

  if (topic.relatedSlugs?.length) {
    parts.push(
      '## Related',
      '',
      ...topic.relatedSlugs.map((r) => {
        const rel = `${learnKindToPath(r.kind)}/${r.slug}.md`
        return `- [${r.label}](./${r.kind === topic.kind ? `${r.slug}.md` : `../${rel}`}) (\`${r.kind}/${r.slug}\`)`
      }),
      '',
    )
  }

  parts.push(
    '## Sources',
    '',
    '**Docs**',
    '',
    bullets(topic.sourceDocs.map((d) => `\`${d}\``)),
    '',
    '**Code**',
    '',
    bullets(topic.sourceCode.map((d) => `\`${d}\``)),
    '',
    `*Last reviewed: ${topic.lastReviewed}*`,
    '',
    '---',
    '',
    '*Educational only — not investment advice. Static export for AI tools and plain-text readers.*',
    '',
  )

  return parts.join('\n')
}

export function buildLearnExportIndex(topics: LearnTopic[], opts?: { baseUrl?: string }): string {
  const base = (opts?.baseUrl || '').replace(/\/$/, '')
  const indicators = topics.filter((t) => t.kind === 'indicator')
  const concepts = topics.filter((t) => t.kind === 'concept')
  const patterns = topics.filter((t) => t.kind === 'pattern')

  const link = (t: LearnTopic) => {
    const rel = topicExportRelPath(t)
    const href = base ? `${base}/learn-export/${rel}` : `./${rel}`
    const spa = base ? `${base}${learnTopicPath(t.kind, t.slug)}` : learnTopicPath(t.kind, t.slug)
    return `- [${t.title}](${href}) — ${t.shortDescription} *(SPA: ${spa})*`
  }

  return [
    '# TIP Learn — Markdown export',
    '',
    'Static, no-JavaScript copies of every Learn topic for AI tools, search, and plain-text readers.',
    '',
    '| Bundle | Path |',
    '| --- | --- |',
    `| All topics (one file) | ${base ? `${base}/learn-export/ALL.md` : './ALL.md'} |`,
    `| This index | ${base ? `${base}/learn-export/index.md` : './index.md'} |`,
    `| HTML index | ${base ? `${base}/learn-export/index.html` : './index.html'} |`,
    '',
    '## Indicators',
    '',
    ...indicators.map(link),
    '',
    '## Context',
    '',
    ...concepts.map(link),
    '',
    '## Patterns',
    '',
    ...patterns.map(link),
    '',
    '---',
    '',
    '*Educational only — not investment advice.*',
    '',
  ].join('\n')
}

export function buildLearnExportAll(topics: LearnTopic[], opts?: { baseUrl?: string }): string {
  const chunks = [
    '# TIP Learn — complete export',
    '',
    `Generated from the TIP frontend Learn catalog (${topics.length} topics).`,
    '',
    'Use this file when pasting into an AI chat that cannot browse multiple URLs.',
    '',
    '---',
    '',
  ]
  for (const t of topics) {
    chunks.push(topicToMarkdown(t, opts), '', '---', '')
  }
  return chunks.join('\n')
}

export function buildLearnExportHtmlIndex(topics: LearnTopic[]): string {
  const li = (t: LearnTopic) =>
    `<li><a href="./${topicExportRelPath(t)}">${escapeHtml(t.title)}</a> — ${escapeHtml(t.shortDescription)}</li>`
  const indicators = topics.filter((t) => t.kind === 'indicator')
  const concepts = topics.filter((t) => t.kind === 'concept')
  const patterns = topics.filter((t) => t.kind === 'pattern')
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TIP Learn — Markdown export</title>
  <meta name="description" content="Static Markdown export of TIP Learn topics for AI tools and plain-text readers." />
</head>
<body>
  <h1>TIP Learn — Markdown export</h1>
  <p>Static copies (no JavaScript). Prefer these URLs for AI tools.</p>
  <p><a href="./ALL.md"><strong>ALL.md</strong></a> — every topic in one file · <a href="./index.md">index.md</a></p>
  <h2>Indicators</h2>
  <ul>
    ${indicators.map(li).join('\n    ')}
  </ul>
  <h2>Context</h2>
  <ul>
    ${concepts.map(li).join('\n    ')}
  </ul>
  <h2>Patterns</h2>
  <ul>
    ${patterns.map(li).join('\n    ')}
  </ul>
  <p><em>Educational only — not investment advice.</em></p>
</body>
</html>
`
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
