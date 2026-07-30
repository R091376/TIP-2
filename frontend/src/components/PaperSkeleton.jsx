/** Lightweight skeleton placeholders for paper desk tables. */
export default function PaperSkeleton({ rows = 4, cols = 6, label = 'Loading' }) {
  return (
    <div className="paper-skeleton" role="status" aria-live="polite" aria-label={label}>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="paper-skeleton__row">
          {Array.from({ length: cols }, (_, c) => (
            <span
              key={c}
              className="paper-skeleton__cell"
              style={{ width: `${55 + ((r + c) % 4) * 10}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
