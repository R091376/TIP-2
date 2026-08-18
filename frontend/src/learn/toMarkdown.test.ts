import { describe, expect, it } from 'vitest'
import { ALL_TOPICS } from './catalog'
import { learnKindToPath } from './routing'
import {
  buildLearnExportAll,
  buildLearnExportIndex,
  topicExportRelPath,
  topicToMarkdown,
} from './toMarkdown'

describe('toMarkdown', () => {
  it('exports every catalog topic with title and plain English', () => {
    expect(ALL_TOPICS.length).toBeGreaterThanOrEqual(14)
    for (const t of ALL_TOPICS) {
      const md = topicToMarkdown(t)
      expect(md).toContain(`# ${t.title}`)
      expect(md).toContain('## Plain English')
      expect(md).toContain(t.plainEnglish[0])
      expect(topicExportRelPath(t)).toBe(`${learnKindToPath(t.kind)}/${t.slug}.md`)
    }
  })

  it('builds index and ALL bundles', () => {
    const index = buildLearnExportIndex(ALL_TOPICS)
    expect(index).toContain('# TIP Learn — Markdown export')
    expect(index).toContain('breakout')
    expect(index).toContain('Woodie support')
    const woodie = ALL_TOPICS.find((t) => t.slug === 'woodie-sr')
    expect(woodie).toBeTruthy()
    const md = topicToMarkdown(woodie!)
    expect(md).toContain('## Questions this answers')
    expect(md).toContain('## How to use it in TIP')
    const all = buildLearnExportAll(ALL_TOPICS)
    expect(all.split('# ').length).toBeGreaterThan(ALL_TOPICS.length)
  })
})
