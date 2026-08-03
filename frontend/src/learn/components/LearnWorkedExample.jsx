export default function LearnWorkedExample({ example }) {
  if (!example) return null
  return (
    <div className="learn-example">
      <p>{example.narrative}</p>
      {example.periodNote ? (
        <p className="learn-example__note">
          <strong>Note:</strong> {example.periodNote}
        </p>
      ) : null}
      {example.inputs?.length ? (
        <ul className="learn-example__inputs">
          {example.inputs.map((inp) => (
            <li key={inp.label}>
              <strong>{inp.label}:</strong> {inp.value}
            </li>
          ))}
        </ul>
      ) : null}
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
