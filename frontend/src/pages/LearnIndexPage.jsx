import { useMemo, useState } from 'react'
import { listTopics } from '../learn/catalog'
import LearnDisclaimer from '../learn/components/LearnDisclaimer'
import LearnGlossary from '../learn/components/LearnGlossary'
import LearnTopicCard from '../learn/components/LearnTopicCard'
import './authPages.css'
import './adminLearn.css'

const GROUP_CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'indicator', label: 'Indicators' },
  { id: 'context', label: 'Context' },
  { id: 'range', label: 'Range' },
  { id: 'candlestick', label: 'Candlestick' },
  { id: 'structure', label: 'Structure' },
]

export default function LearnIndexPage() {
  const [q, setQ] = useState('')
  const [group, setGroup] = useState('all')

  const topics = useMemo(() => listTopics(), [])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return topics.filter((t) => {
      if (group !== 'all' && t.group !== group) return false
      if (!needle) return true
      return (
        t.title.toLowerCase().includes(needle) ||
        t.shortDescription.toLowerCase().includes(needle) ||
        t.slug.toLowerCase().includes(needle)
      )
    })
  }, [topics, q, group])

  const indicators = filtered.filter((t) => t.kind === 'indicator')
  const concepts = filtered.filter((t) => t.kind === 'concept')
  const patterns = filtered.filter((t) => t.kind === 'pattern')

  return (
    <div className="admin-page admin-page--in-shell">
      <header className="admin-header">
        <div>
          <h1 className="admin-header__title">Learn</h1>
          <p className="admin-header__sub">
            How TIP calculates indicators, daily context (Woodie S/R), and patterns
          </p>
        </div>
      </header>

      <LearnDisclaimer />

      <section className="admin-card learn-export-card">
        <h2>AI / plain-text export</h2>
        <p className="admin-header__sub" style={{ marginBottom: '0.75rem' }}>
          Static Markdown (no JavaScript) for AI tools like Grok. Prefer these over the SPA if a tool
          cannot run the browser app.
        </p>
        <ul className="learn-export-links">
          <li>
            <a href="/learn-export/index.html">HTML index</a>
            <span> — clickable list of all topics</span>
          </li>
          <li>
            <a href="/learn-export/index.md">index.md</a>
            <span> — Markdown table of contents</span>
          </li>
          <li>
            <a href="/learn-export/ALL.md">
              <strong>ALL.md</strong>
            </a>
            <span> — every topic in one file (best for pasting into chat)</span>
          </li>
        </ul>
      </section>

      <section className="admin-card">
        <h2>Topics</h2>
        <p className="admin-header__sub" style={{ marginBottom: '0.75rem' }}>
          Beginner-friendly explanations of every indicator, context idea, and pattern TIP uses.
          Pick a topic to see plain English, steps, a formula, a worked example, and live defaults.
        </p>

        <div className="learn-toolbar">
          <input
            className="learn-search"
            type="search"
            placeholder="Search topics…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search learn topics"
          />
          <div className="learn-chips" role="group" aria-label="Filter by group">
            {GROUP_CHIPS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`learn-chip${group === c.id ? ' learn-chip--active' : ''}`}
                onClick={() => setGroup(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {indicators.length > 0 ? (
          <>
            <h3 className="learn-section-title">Indicators ({indicators.length})</h3>
            <div className="learn-grid">
              {indicators.map((t) => (
                <LearnTopicCard key={t.slug} topic={t} />
              ))}
            </div>
          </>
        ) : null}

        {concepts.length > 0 ? (
          <>
            <h3 className="learn-section-title">Context ({concepts.length})</h3>
            <div className="learn-grid">
              {concepts.map((t) => (
                <LearnTopicCard key={t.slug} topic={t} />
              ))}
            </div>
          </>
        ) : null}

        {patterns.length > 0 ? (
          <>
            <h3 className="learn-section-title">Patterns ({patterns.length})</h3>
            <div className="learn-grid">
              {patterns.map((t) => (
                <LearnTopicCard key={t.slug} topic={t} />
              ))}
            </div>
          </>
        ) : null}

        {filtered.length === 0 ? (
          <p className="admin-empty">No topics match your search.</p>
        ) : null}
      </section>

      <LearnGlossary />
    </div>
  )
}
