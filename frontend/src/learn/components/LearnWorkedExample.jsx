import LearnDiagram from './LearnDiagram'

function SetupList({ items }) {
  if (!items?.length) return null
  return (
    <ul className="learn-example__inputs">
      {items.map((inp) => (
        <li key={inp.label}>
          <strong>{inp.label}:</strong> {inp.value}
        </li>
      ))}
    </ul>
  )
}

function TimelineTable({ timeline }) {
  if (!timeline?.length) return null
  return (
    <div className="learn-example__table-wrap">
      <table className="learn-example__table">
        <thead>
          <tr>
            <th scope="col">Bar</th>
            <th scope="col">Prices</th>
            <th scope="col">What TIP does</th>
          </tr>
        </thead>
        <tbody>
          {timeline.map((row) => {
            const prices =
              row.ohlc ||
              [row.high && `H ${row.high}`, row.low && `L ${row.low}`, row.close && `C ${row.close}`]
                .filter(Boolean)
                .join(' · ') ||
              '—'
            return (
              <tr key={row.label}>
                <td className="learn-example__bar">{row.label}</td>
                <td className="admin-mono learn-example__prices">{prices}</td>
                <td>{row.note || '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Scoreboards({ scoreboards }) {
  if (!scoreboards?.length) return null
  return (
    <div className="learn-example__scoreboards">
      {scoreboards.map((sb) => (
        <div key={sb.label} className="learn-example__scoreboard">
          <h4 className="learn-example__scoreboard-title">{sb.label}</h4>
          <dl className="learn-example__scoreboard-grid">
            {sb.rows.map((r) => (
              <div key={r.metric} className="learn-example__scoreboard-row">
                <dt>{r.metric}</dt>
                <dd className="admin-mono">{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  )
}

function RulesVsMeasurements({ block }) {
  if (!block) return null
  return (
    <div className="learn-example__rvm">
      <div className="learn-example__rvm-col">
        <h4>Decision rules (end the game)</h4>
        <ul>
          {block.rules.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </div>
      <div className="learn-example__rvm-col">
        <h4>Path measurements (scoreboard)</h4>
        <ul>
          {block.measurements.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function ScenarioBlock({ scenario }) {
  return (
    <article className="learn-example__scenario" id={`learn-ex-${scenario.id}`}>
      <h3 className="learn-example__scenario-title">{scenario.title}</h3>
      <p>{scenario.narrative}</p>
      {scenario.periodNote ? (
        <p className="learn-example__note">
          <strong>Note:</strong> {scenario.periodNote}
        </p>
      ) : null}
      {scenario.setup?.length ? (
        <>
          <h4 className="learn-example__subhead">Setup</h4>
          <SetupList items={scenario.setup} />
        </>
      ) : null}
      {scenario.diagram ? (
        <>
          <h4 className="learn-example__subhead">Diagram</h4>
          <LearnDiagram diagram={scenario.diagram} />
        </>
      ) : null}
      {scenario.timeline?.length ? (
        <>
          <h4 className="learn-example__subhead">Bar-by-bar</h4>
          <TimelineTable timeline={scenario.timeline} />
        </>
      ) : null}
      <Scoreboards scoreboards={scenario.scoreboards} />
      {scenario.steps?.length ? (
        <>
          <h4 className="learn-example__subhead">Steps</h4>
          <ol className="learn-example__steps">
            {scenario.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </>
      ) : null}
      <RulesVsMeasurements block={scenario.rulesVsMeasurements} />
      <p className="learn-example__result">
        <strong>Result:</strong> {scenario.result}
      </p>
    </article>
  )
}

function LegacyExample({ example }) {
  return (
    <div className="learn-example learn-example--legacy">
      <p>{example.narrative}</p>
      {example.periodNote ? (
        <p className="learn-example__note">
          <strong>Note:</strong> {example.periodNote}
        </p>
      ) : null}
      <SetupList items={example.inputs} />
      <ol className="learn-example__steps">
        {example.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      <p className="learn-example__result">
        <strong>Result:</strong> {example.result}
      </p>
    </div>
  )
}

/**
 * Renders deep multi-scenario examples when present; otherwise the legacy single block.
 */
export default function LearnWorkedExample({ example }) {
  if (!example) return null

  const scenarios = example.scenarios
  if (scenarios?.length) {
    return (
      <div className="learn-example learn-example--deep">
        <p className="learn-example__lead">
          Walk through the numbers the way TIP does: freeze rails at detect, update the path each
          closed bar, then apply win/lose rules. Round numbers are for teaching; the rules match
          production.
        </p>
        {scenarios.map((sc) => (
          <ScenarioBlock key={sc.id} scenario={sc} />
        ))}
      </div>
    )
  }

  return <LegacyExample example={example} />
}
