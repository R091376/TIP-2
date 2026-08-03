export type LearnKind = 'indicator' | 'pattern'

/** Index chips / filters */
export type LearnGroup =
  | 'indicator'
  | 'range'
  | 'candlestick'
  | 'structure'

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

export type WorkedExample = {
  narrative: string
  periodNote?: string
  inputs: { label: string; value: string }[]
  steps: string[]
  result: string
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
}
