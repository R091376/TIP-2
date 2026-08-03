export default function LearnParamsTable({ parameters }) {
  if (!parameters?.length) return null
  return (
    <div className="admin-table-wrap">
      <table className="admin-table learn-params-table">
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Default</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          {parameters.map((p) => (
            <tr key={p.configKey} className={p.advanced ? 'learn-params-table__advanced' : undefined}>
              <td className="admin-mono">{p.name}</td>
              <td className="admin-mono">{p.value}</td>
              <td>{p.notes || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
