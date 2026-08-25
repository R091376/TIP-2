import { entryFailedMessage, MARKET_CLOSED_MSG } from './helpers'
import { parseCtsEnd } from '../utils/woodieSr'

export const CTS_ENDED_MSG = {
  cas_cash: 'Continuous session ended (CAS). Last cash bar 15:10–15:15 IST.',
  index: 'Index session ended at 15:15 IST. Showing last continuous print.',
}

export function istMinutesNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const h = Number(parts.find((p) => p.type === 'hour')?.value)
  const m = Number(parts.find((p) => p.type === 'minute')?.value)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  return h * 60 + m
}

export function ctsEnded(ctsEnd, nowMinutes) {
  if (!ctsEnd) return false
  const { hour, minute } = parseCtsEnd(ctsEnd)
  return nowMinutes >= hour * 60 + minute
}

/** Banner when a watchlist entry is FAILED. */
export function failedBannerForEntry(entry) {
  return entryFailedMessage(entry)
}

/** Info line after historical candles load (or empty). */
export function infoAfterCandleLoad(candles, marketPhase, opts = {}) {
  const empty = !candles || candles.length === 0
  if (marketPhase === 'closed') {
    return empty
      ? 'Market is closed and no candle history is loaded. Restart the backend or wait for seed recovery.'
      : MARKET_CLOSED_MSG
  }
  const sessionKind = opts.sessionKind
  const ctsEnd = opts.ctsEnd
  const nowMinutes =
    opts.nowMinutes != null ? opts.nowMinutes : istMinutesNow()
  if (
    ctsEnded(ctsEnd, nowMinutes) &&
    (sessionKind === 'cas_cash' || sessionKind === 'index')
  ) {
    if (empty) {
      return sessionKind === 'index'
        ? 'Index session ended at 15:15 IST and no candle history is loaded.'
        : 'Continuous session ended (CAS) and no candle history is loaded.'
    }
    return CTS_ENDED_MSG[sessionKind]
  }
  if (empty) return 'No candle data available yet.'
  return null
}
