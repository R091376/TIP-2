export type LearnKind = 'indicator' | 'pattern' | 'concept'

/** Index chips / filters */
export type LearnGroup =
  | 'indicator'
  | 'range'
  | 'candlestick'
  | 'structure'
  | 'context'

export type LearnDirection = 'long' | 'short' | 'both' | 'regime'

export type TipParameter = {
  /** Display leaf key (not used for snapshot equality). */
  name: string
  /** Serialized form via serializeTipDefault — must match tipDefaults. */
  value: string
  /** Stable path into tipDefaults, e.g. breakout.lookback_candles or atr_period. */
  configKey: string
  notes?: string
  advanced?: boolean
}

/** One row in a bar-by-bar timeline. */
export type ExampleCandle = {
  /** e.g. "Bar 0 (detect)", "Bar 1" */
  label: string
  /** Full OHLC summary when useful */
  ohlc?: string
  close?: string
  high?: string
  low?: string
  /** What TIP does on this bar */
  note?: string
}

/** Snapshot of frozen rails / path metrics after a bar. */
export type ExampleScoreboard = {
  label: string
  rows: { metric: string; value: string }[]
}

/** One OHLC bar for code-drawn Learn diagrams (pilot: candles). */
export type DiagramCandle = {
  o: number
  h: number
  l: number
  c: number
  /** X-axis label under the bar */
  label?: string
  /** Highlight (e.g. detect bar) */
  emphasis?: boolean
}

/** Horizontal price rail on a candle diagram. */
export type DiagramLevel = {
  price: number
  label: string
  /** Visual role — colors in LearnDiagram */
  kind?: 'entry' | 'stop' | 'target' | 'reference' | 'other'
}

/** Vertical bar value (e.g. true-range series for ATR). */
export type DiagramValueBar = {
  label: string
  value: number
  note?: string
}

/**
 * Static diagram data rendered by LearnDiagram (SVG).
 * Numbers must match the scenario text — never freehand AI art.
 */
export type LearnDiagram =
  | {
      type: 'candles'
      title?: string
      caption?: string
      candles: DiagramCandle[]
      levels?: DiagramLevel[]
    }
  | {
      type: 'bars'
      title?: string
      caption?: string
      bars: DiagramValueBar[]
      /** Optional horizontal reference (e.g. first ATR average) */
      averageLine?: { value: number; label: string }
    }

/**
 * One deep teaching scenario (success path, fail path, no-detect, compute, …).
 * Prefer 2 scenarios for patterns; indicators often use 1–2.
 */
export type WorkedScenario = {
  id: string
  title: string
  narrative: string
  periodNote?: string
  /** Frozen at detect / setup inputs */
  setup: { label: string; value: string }[]
  /** Optional bar-by-bar timeline */
  timeline?: ExampleCandle[]
  /** Optional intermediate scoreboards */
  scoreboards?: ExampleScoreboard[]
  /** Optional code-drawn diagram (pilot topics) */
  diagram?: LearnDiagram
  /** Ordered teaching steps */
  steps: string[]
  /** Explicit “rules vs measurements” callout */
  rulesVsMeasurements?: {
    rules: string[]
    measurements: string[]
  }
  result: string
}

/**
 * Legacy single-block example remains required for every topic.
 * When `scenarios` is present, the UI renders those as the deep examples
 * and still keeps the summary fields for tests / fallbacks.
 */
export type WorkedExample = {
  narrative: string
  periodNote?: string
  inputs: { label: string; value: string }[]
  steps: string[]
  result: string
  /** Deep multi-scenario content */
  scenarios?: WorkedScenario[]
}

export type LearnTopic = {
  kind: LearnKind
  slug: string
  title: string
  shortDescription: string
  group: LearnGroup
  direction?: LearnDirection
  plottedOnChart: boolean
  plainEnglish: string[]
  howWeCalculate: string[]
  formulaPlain: string
  formulaFormal: string
  workedExample: WorkedExample
  tipParameters: TipParameter[]
  lifecycle?: string[]
  closedCandleOnly: boolean
  indexVolumeNote?: string
  relatedSlugs: { kind: LearnKind; slug: string; label: string }[]
  patternTypeId?: string
  sourceDocs: string[]
  sourceCode: string[]
  lastReviewed: string
  detectorVersionHint?: string
  /** Research / product questions this topic answers. */
  questionsItSolves?: string[]
  /** How to use the idea in TIP (Research filters, journal stamps, …). */
  howToUse?: string[]
}
