/** Public textbook / ChartSchool / empirical pages for non-classical Learn topics. */
export type LearnSource = { label: string; url: string; note?: string }

export const ATR_SOURCES: LearnSource[] = [
  {
    label: 'StockCharts ChartSchool — Average True Range (ATR)',
    url: 'https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/average-true-range-atr',
    note: 'Wilder 1978; TR = max(H−L, |H−prior C|, |L−prior C|); default period 14; Wilder smoothing',
  },
  {
    label: 'Investopedia — Average True Range (ATR)',
    url: 'https://www.investopedia.com/terms/a/atr.asp',
  },
]

export const DONCHIAN_SOURCES: LearnSource[] = [
  {
    label: 'StockCharts ChartSchool — Price Channels (Donchian)',
    url: 'https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/price-channels',
    note: 'Richard Donchian; N-period high / low channel (default 20)',
  },
  {
    label: 'StockCharts ChartSchool — Donchian Trading Guidelines',
    url: 'https://chartschool.stockcharts.com/table-of-contents/overview/donchian-trading-guidelines',
  },
  {
    label: 'Investopedia — Donchian Channels',
    url: 'https://www.investopedia.com/terms/d/donchianchannels.asp',
  },
]

export const VOLUME_SMA_SOURCES: LearnSource[] = [
  {
    label: 'StockCharts ChartSchool — Moving Averages (SMA)',
    url: 'https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/moving-averages-simple-and-exponential',
    note: 'Simple average of the last N values; TIP applies this to volume',
  },
  {
    label: 'StockCharts ChartSchool — Relative Volume (RVOL)',
    url: 'https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/relative-volume-rvol',
    note: 'Current volume vs a lookback average — same idea as breakout volume confirmation',
  },
  {
    label: 'Investopedia — Volume',
    url: 'https://www.investopedia.com/terms/v/volume.asp',
  },
]

export const WOODIE_SOURCES: LearnSource[] = [
  {
    label: 'MyPivots — Woodie Pivot Points',
    url: 'https://www.mypivots.com/dictionary/definition/228/woodie-pivot-points',
    note: 'PP = (H + L + 2 × today’s open) / 4 — the open-weighted formula TIP uses',
  },
  {
    label: 'Sierra Chart — Pivot Points (Formula Type 3)',
    url: 'https://www.sierrachart.com/index.php?page=doc/PivotPoints.html',
    note: 'PP = (yesterday H + L + current open + current open) / 4',
  },
  {
    label: 'eSignal — Woodie_Pivots.efs',
    url: 'https://efs.kb.esignal.com/hc/en-us/articles/6362892232987-Woodie-Pivots-efs',
    note: 'PP = (yesterday H + yesterday L + (today open × 2)) / 4',
  },
  {
    label: 'thinkorswim — WoodiesPivots (Ken Wood)',
    url: 'https://toslc.thinkorswim.com/center/reference/Tech-Indicators/studies-library/V-Z/WoodiesPivots',
  },
  {
    label: 'StockCharts ChartSchool — Pivot Points',
    url: 'https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/pivot-points',
    note: 'What a daily pivot ladder is; documents Standard (H+L+C)/3, not Woodie-open',
  },
]

export const BREAKOUT_SOURCES: LearnSource[] = [
  {
    label: 'StockCharts ChartSchool — Price Channels (Donchian)',
    url: 'https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/price-channels',
    note: 'Close above the N-period high is the channel breakout',
  },
  {
    label: 'Investopedia — Breakout',
    url: 'https://www.investopedia.com/terms/b/breakout.asp',
  },
]

export const BREAKDOWN_SOURCES: LearnSource[] = [
  {
    label: 'StockCharts ChartSchool — Price Channels (Donchian)',
    url: 'https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/price-channels',
    note: 'Close below the N-period low is the channel breakdown',
  },
  {
    label: 'Investopedia — Breakdown',
    url: 'https://www.investopedia.com/terms/b/breakdown.asp',
  },
]

export const CONSOLIDATION_SOURCES: LearnSource[] = [
  {
    label: 'StockCharts ChartSchool — Rectangle',
    url: 'https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/rectangle',
    note: 'Multi-bar congestion / trading range',
  },
  {
    label: 'StockCharts ChartSchool — Bollinger Band Squeeze',
    url: 'https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/bollinger-band-squeeze',
    note: 'Volatility compression before expansion',
  },
  {
    label: 'StockCharts ChartSchool — Narrow Range Day (NR7)',
    url: 'https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/narrow-range-day-nr7',
    note: 'Related compression idea; TIP uses ATR-normalized multi-bar range, not NR7',
  },
]

export const VOLUME_BREAKOUT_SOURCES: LearnSource[] = [
  {
    label: 'StockCharts ChartSchool — Relative Volume (RVOL)',
    url: 'https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/relative-volume-rvol',
    note: 'Unusual volume vs a lookback average',
  },
  {
    label: 'StockCharts ChartSchool — On Balance Volume',
    url: 'https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/on-balance-volume-obv',
    note: 'Volume confirms price commitment (Elder / Granville lineage)',
  },
  {
    label: 'Investopedia — Volume',
    url: 'https://www.investopedia.com/terms/v/volume.asp',
  },
]

export const HAMMER_SOURCES: LearnSource[] = [
  {
    label: 'StockCharts ChartSchool — Hammer',
    url: 'https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlestick-pattern-dictionary#hammer',
    note: 'Long lower shadow; close well above the session low',
  },
  {
    label: 'StockCharts ChartSchool — Bullish reversal candlesticks',
    url: 'https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlestick-bullish-reversal-patterns',
  },
  {
    label: 'Investopedia — Hammer',
    url: 'https://www.investopedia.com/terms/h/hammer.asp',
  },
]

export const SHOOTING_STAR_SOURCES: LearnSource[] = [
  {
    label: 'StockCharts ChartSchool — Shooting Star',
    url: 'https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlestick-pattern-dictionary#shooting_star',
    note: 'Long upper shadow; close near the open after a failed rally',
  },
  {
    label: 'StockCharts ChartSchool — Bearish reversal candlesticks',
    url: 'https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlestick-bearish-reversal-patterns',
  },
  {
    label: 'Investopedia — Shooting Star',
    url: 'https://www.investopedia.com/terms/s/shootingstar.asp',
  },
]

export const BULLISH_ENGULFING_SOURCES: LearnSource[] = [
  {
    label: 'StockCharts ChartSchool — Engulfing Pattern',
    url: 'https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlestick-pattern-dictionary#engulfing_pattern',
    note: 'Body engulfs prior body (not necessarily the full high–low range)',
  },
  {
    label: 'StockCharts ChartSchool — Bullish reversal candlesticks',
    url: 'https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlestick-bullish-reversal-patterns',
  },
  {
    label: 'Investopedia — Bullish Engulfing',
    url: 'https://www.investopedia.com/terms/b/bullishengulfingpattern.asp',
  },
]

export const BEARISH_ENGULFING_SOURCES: LearnSource[] = [
  {
    label: 'StockCharts ChartSchool — Engulfing Pattern',
    url: 'https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlestick-pattern-dictionary#engulfing_pattern',
    note: 'Body engulfs prior body (not necessarily the full high–low range)',
  },
  {
    label: 'StockCharts ChartSchool — Bearish reversal candlesticks',
    url: 'https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlestick-bearish-reversal-patterns',
  },
  {
    label: 'Investopedia — Bearish Engulfing',
    url: 'https://www.investopedia.com/terms/b/bearishengulfingp.asp',
  },
]

export const INSIDE_BAR_SOURCES: LearnSource[] = [
  {
    label: 'Investopedia — Inside Day',
    url: 'https://www.investopedia.com/terms/i/inside-day.asp',
    note: 'High and low contained in the prior bar’s range (mother–inside)',
  },
  {
    label: 'StockCharts ChartSchool — Narrow Range Day (NR7)',
    url: 'https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/narrow-range-day-nr7',
    note: 'Related compression-then-expansion idea; TIP fires on a close through the mother, not NR7 rank',
  },
]

export const HIGHER_HIGH_SOURCES: LearnSource[] = [
  {
    label: 'StockCharts ChartSchool — Alligator (Bill Williams)',
    url: 'https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/alligator',
    note: 'Williams fractals: a high/low that is the extreme of the surrounding N bars',
  },
  {
    label: 'StockCharts ChartSchool — Swing Charting',
    url: 'https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/swing-charting',
  },
  {
    label: 'Investopedia — Fractal (Williams)',
    url: 'https://www.investopedia.com/terms/f/fractal.asp',
    note: 'Five-bar fractal (width 2) is the default Williams definition; TIP default width is also 2',
  },
]

export const LOWER_LOW_SOURCES: LearnSource[] = HIGHER_HIGH_SOURCES
