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

  it('classical topics export ChartSchool URLs under Sources', () => {
    const db = ALL_TOPICS.find((t) => t.slug === 'double_bottom')
    expect(db).toBeTruthy()
    const md = topicToMarkdown(db!)
    expect(md).toContain('**Textbook / online**')
    expect(md).toContain('chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/double-bottom-reversal')
    expect(md).toContain('thepatternsite.com/dbsetup.html')
  })

  it('ATR and Woodie exports include live formula pages', () => {
    const atr = ALL_TOPICS.find((t) => t.slug === 'atr-14')
    expect(topicToMarkdown(atr!)).toContain('average-true-range-atr')
    const woodie = ALL_TOPICS.find((t) => t.slug === 'woodie-sr')
    const md = topicToMarkdown(woodie!)
    expect(md).toContain('mypivots.com/dictionary/definition/228/woodie-pivot-points')
    expect(md).toContain('sierrachart.com')
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
