import { barDomain, candleDomain, makeLinearScale } from '../diagramScale'

const LEVEL_COLORS = {
  entry: '#60a5fa',
  stop: '#f87171',
  target: '#4ade80',
  reference: '#fbbf24',
  other: '#a8b0bd',
}

function CandleChart({ diagram }) {
  const candles = diagram.candles || []
  const levels = diagram.levels || []
  if (!candles.length) return null

  const width = 640
  const height = 280
  const padL = 48
  const padR = 88
  const padT = 20
  const padB = 36
  const plotW = width - padL - padR
  const plotH = height - padT - padB

  const { min, max } = candleDomain(candles, levels)
  const yOf = makeLinearScale(min, max, padT, padT + plotH)

  const n = candles.length
  const slot = plotW / n
  const bodyW = Math.min(28, slot * 0.45)

  // price ticks
  const ticks = 4
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => min + ((max - min) * i) / ticks)

  return (
    <svg
      className="learn-diagram__svg"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={diagram.title || 'Candlestick diagram'}
    >
      <rect x={0} y={0} width={width} height={height} className="learn-diagram__bg" rx={8} />

      {tickVals.map((v) => {
        const y = yOf(v)
        return (
          <g key={`t-${v}`}>
            <line
              x1={padL}
              x2={width - padR}
              y1={y}
              y2={y}
              className="learn-diagram__grid"
            />
            <text x={padL - 6} y={y + 3} textAnchor="end" className="learn-diagram__tick">
              {formatPrice(v)}
            </text>
          </g>
        )
      })}

      {levels.map((lv) => {
        const y = yOf(lv.price)
        const color = LEVEL_COLORS[lv.kind || 'other'] || LEVEL_COLORS.other
        return (
          <g key={`${lv.label}-${lv.price}`}>
            <line
              x1={padL}
              x2={width - padR + 4}
              y1={y}
              y2={y}
              stroke={color}
              strokeWidth={1.5}
              strokeDasharray={lv.kind === 'reference' ? '4 3' : '0'}
              opacity={0.95}
            />
            <text
              x={width - padR + 8}
              y={y + 3}
              className="learn-diagram__level-label"
              fill={color}
            >
              {lv.label} {formatPrice(lv.price)}
            </text>
          </g>
        )
      })}

      {candles.map((c, i) => {
        const cx = padL + slot * i + slot / 2
        const yH = yOf(c.h)
        const yL = yOf(c.l)
        const yO = yOf(c.o)
        const yC = yOf(c.c)
        const bull = c.c >= c.o
        const top = Math.min(yO, yC)
        const bot = Math.max(yO, yC)
        const bodyH = Math.max(bot - top, 1.5)
        const stroke = bull ? '#22c55e' : '#ef4444'
        const fill = bull ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.4)'
        return (
          <g key={i}>
            {c.emphasis ? (
              <rect
                x={cx - slot * 0.42}
                y={padT}
                width={slot * 0.84}
                height={plotH}
                className="learn-diagram__emphasis"
              />
            ) : null}
            <line x1={cx} x2={cx} y1={yH} y2={yL} stroke={stroke} strokeWidth={1.5} />
            <rect
              x={cx - bodyW / 2}
              y={top}
              width={bodyW}
              height={bodyH}
              fill={fill}
              stroke={stroke}
              strokeWidth={1.25}
              rx={1}
            />
            <text x={cx} y={height - 12} textAnchor="middle" className="learn-diagram__bar-label">
              {c.label || `B${i}`}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function BarsChart({ diagram }) {
  const bars = diagram.bars || []
  if (!bars.length) return null

  const width = 640
  const height = 240
  const padL = 48
  const padR = 24
  const padT = 24
  const padB = 40
  const plotW = width - padL - padR
  const plotH = height - padT - padB

  const values = bars.map((b) => b.value)
  const { min, max } = barDomain(values)
  const yOf = makeLinearScale(min, max, padT, padT + plotH)
  const y0 = yOf(0)

  const n = bars.length
  const slot = plotW / n
  const barW = Math.min(48, slot * 0.5)

  const avg = diagram.averageLine

  return (
    <svg
      className="learn-diagram__svg"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={diagram.title || 'Bar diagram'}
    >
      <rect x={0} y={0} width={width} height={height} className="learn-diagram__bg" rx={8} />

      <line x1={padL} x2={width - padR} y1={y0} y2={y0} className="learn-diagram__grid" />

      {bars.map((b, i) => {
        const cx = padL + slot * i + slot / 2
        const y = yOf(b.value)
        const h = Math.max(y0 - y, 1)
        return (
          <g key={b.label}>
            <rect
              x={cx - barW / 2}
              y={y}
              width={barW}
              height={h}
              className="learn-diagram__value-bar"
              rx={3}
            />
            <text x={cx} y={y - 6} textAnchor="middle" className="learn-diagram__value-num">
              {formatPrice(b.value)}
            </text>
            <text x={cx} y={height - 14} textAnchor="middle" className="learn-diagram__bar-label">
              {b.label}
            </text>
          </g>
        )
      })}

      {avg ? (
        <g>
          <line
            x1={padL}
            x2={width - padR}
            y1={yOf(avg.value)}
            y2={yOf(avg.value)}
            stroke="#fbbf24"
            strokeWidth={1.75}
            strokeDasharray="5 3"
          />
          <text
            x={width - padR}
            y={yOf(avg.value) - 6}
            textAnchor="end"
            className="learn-diagram__level-label"
            fill="#fbbf24"
          >
            {avg.label} {formatPrice(avg.value)}
          </text>
        </g>
      ) : null}
    </svg>
  )
}

function formatPrice(v) {
  if (!Number.isFinite(v)) return '—'
  const a = Math.abs(v)
  if (a >= 100) return v.toFixed(1)
  if (a >= 10) return v.toFixed(2)
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

/**
 * Code-drawn diagram for Learn scenarios (candles or value bars).
 */
export default function LearnDiagram({ diagram }) {
  if (!diagram) return null

  return (
    <figure className="learn-diagram">
      {diagram.title ? <figcaption className="learn-diagram__title">{diagram.title}</figcaption> : null}
      <div className="learn-diagram__frame">
        {diagram.type === 'bars' ? <BarsChart diagram={diagram} /> : <CandleChart diagram={diagram} />}
      </div>
      {diagram.caption ? <p className="learn-diagram__caption">{diagram.caption}</p> : null}
    </figure>
  )
}
