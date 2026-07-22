const NSE_TIMEZONE = 'Asia/Kolkata'

const nsePartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: NSE_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  // Prefer h23 so midnight is "00" not "24" (24 breaks Date.UTC ordering).
  hourCycle: 'h23',
})

function partValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  return Number(parts.find((part) => part.type === type)?.value ?? 0)
}

/**
 * Lightweight Charts has no native timezone support — it always displays UTC
 * components. Shift each bar timestamp so UTC wall-clock matches IST.
 *
 * Uses formatToParts instead of the docs' toLocaleString round-trip, which
 * breaks when the browser is already in the target timezone.
 *
 * @see https://tradingview.github.io/lightweight-charts/docs/time-zones
 */
export function utcToNseChartTime(utcSeconds: number | string | null | undefined): number {
  if (utcSeconds == null || utcSeconds === '') return 0
  const sec = Number(utcSeconds)
  if (!Number.isFinite(sec)) return 0
  const parts = nsePartsFormatter.formatToParts(new Date(sec * 1000))
  let hour = partValue(parts, 'hour')
  // Some engines still emit 24 for midnight; roll to 0 without advancing the day
  // incorrectly (Date.UTC(y,m,d,24) would move to the next day).
  if (hour >= 24) hour = 0
  return Math.floor(
    Date.UTC(
      partValue(parts, 'year'),
      partValue(parts, 'month') - 1,
      partValue(parts, 'day'),
      hour,
      partValue(parts, 'minute'),
      partValue(parts, 'second'),
    ) / 1000,
  )
}
