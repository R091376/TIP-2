import { entryFailedMessage, MARKET_CLOSED_MSG } from './helpers'

/** Banner when a watchlist entry is FAILED. */
export function failedBannerForEntry(entry) {
  return entryFailedMessage(entry)
}

/** Info line after historical candles load (or empty). */
export function infoAfterCandleLoad(candles, marketPhase) {
  const empty = !candles || candles.length === 0
  if (marketPhase === 'closed') {
    return empty
      ? 'Market is closed and no candle history is loaded. Restart the backend or wait for seed recovery.'
      : MARKET_CLOSED_MSG
  }
  if (empty) return 'No candle data available yet.'
  return null
}
