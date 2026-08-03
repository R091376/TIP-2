import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { getTopic } from '../learn/catalog'
import LearnDisclaimer from '../learn/components/LearnDisclaimer'
import LearnParamsTable from '../learn/components/LearnParamsTable'
import LearnWorkedExample from '../learn/components/LearnWorkedExample'
import { LEARN_INDEX_PATH, learnTopicPath, parseLearnKind } from '../learn/routing'
import './authPages.css'
import './adminLearn.css'

export default function LearnDetailPage() {
  const { user } = useAuth()
  const { kind: kindParam, slug } = useParams()
  const kind = parseLearnKind(kindParam || '')
  const topic = kind && slug ? getTopic(kind, slug) : undefined

  if (!topic) {
    return (
      <div className="admin-page admin-page--in-shell">
        <header className="admin-header">
          <div>
            <h1 className="admin-header__title">Learn</h1>
          </div>
        </header>
        <section className="admin-card">
          <h2>Topic not found</h2>
          <p>That indicator or pattern page does not exist.</p>
          <p>
            <Link className="admin-link" to={LEARN_INDEX_PATH}>
              ← Back to Learn
            </Link>
          </p>
        </section>
      </div>
    )
  }

  return (
    <div className="admin-page admin-page--in-shell">
      <header className="admin-header">
        <div>
          <h1 className="admin-header__title">{topic.title}</h1>
          <p className="admin-header__sub">
            Learn
            {user?.username ? (
              <>
                {' '}
                · <strong>{user.username}</strong>
                {user?.role ? ` · ${user.role}` : ''}
              </>
            ) : null}
          </p>
          <div className="learn-detail__meta">
            <span className="learn-badge">{topic.kind}</span>
            <span className="learn-badge">{topic.group}</span>
            {topic.direction ? (
              <span className="learn-badge learn-badge--dir">{topic.direction}</span>
            ) : null}
            {topic.patternTypeId ? (
              <span className="learn-badge admin-mono">{topic.patternTypeId}</span>
            ) : null}
            {topic.plottedOnChart ? (
              <span className="learn-badge learn-badge--chart">plotted on chart</span>
            ) : null}
          </div>
        </div>
      </header>

      <p className="learn-detail__back">
        <Link className="admin-link" to={LEARN_INDEX_PATH}>
          ← All topics
        </Link>
      </p>

      <LearnDisclaimer />

      <section className="admin-card learn-detail__section">
        <h2>In plain English</h2>
        {topic.plainEnglish.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        {topic.closedCandleOnly ? (
          <p className="learn-callout">
            <strong>Closed candles only.</strong> TIP decides after the bar finishes so signals do
            not repaint mid-bar.
          </p>
        ) : null}
        {topic.indexVolumeNote ? (
          <p className="learn-callout">
            <strong>Index / volume:</strong> {topic.indexVolumeNote}
          </p>
        ) : null}
      </section>

      <section className="admin-card learn-detail__section">
        <h2>How we calculate it</h2>
        <ol>
          {topic.howWeCalculate.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </section>

      <section className="admin-card learn-detail__section">
        <h2>Formula</h2>
        <p className="learn-formula-plain">{topic.formulaPlain}</p>
        <pre className="learn-formula-formal">{topic.formulaFormal}</pre>
      </section>

      <section className="admin-card learn-detail__section">
        <h2>Worked example</h2>
        <LearnWorkedExample example={topic.workedExample} />
      </section>

      <section className="admin-card learn-detail__section">
        <h2>Parameters used in TIP</h2>
        <LearnParamsTable parameters={topic.tipParameters} />
      </section>

      {topic.lifecycle?.length ? (
        <section className="admin-card learn-detail__section">
          <h2>Lifecycle</h2>
          <ul>
            {topic.lifecycle.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {topic.relatedSlugs?.length ? (
        <section className="admin-card learn-detail__section">
          <h2>Related</h2>
          <ul className="learn-related">
            {topic.relatedSlugs.map((r) => (
              <li key={`${r.kind}-${r.slug}`}>
                <Link to={learnTopicPath(r.kind, r.slug)}>{r.label}</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="learn-footnote">
        {topic.detectorVersionHint ? (
          <div>
            Detector version: <code>{topic.detectorVersionHint}</code>
          </div>
        ) : null}
        <div>
          Sources:{' '}
          {[...topic.sourceDocs, ...topic.sourceCode].map((s, i) => (
            <span key={s}>
              {i > 0 ? ' · ' : ''}
              <code>{s}</code>
            </span>
          ))}
        </div>
        <div>
          Last reviewed: <code>{topic.lastReviewed}</code>
        </div>
      </footer>
    </div>
  )
}
