import { LONG_TRADE_RULES_VS_MEASUREMENTS, SHORT_TRADE_RULES_VS_MEASUREMENTS } from '../../exampleBlocks'
import { bucketLeafKeys, tipParam } from '../../tipParam'
import type { LearnDirection, LearnTopic, WorkedScenario } from '../../types'

type Spec = {
  slug: string
  title: string
  direction: LearnDirection
  shortDescription: string
  plainEnglish: string[]
  howWeCalculate: string[]
  formulaPlain: string
  formulaFormal: string
  bucket: 'double' | 'head_shoulders'
  detectorVersionHint: string
  sourceDocs: string[]
  sourceCode: string[]
  relatedSlug: { slug: string; label: string }
  success: WorkedScenario
  fail: WorkedScenario
  lifecycle: string[]
}

export function classicalPatternTopic(spec: Spec): LearnTopic {
  const rvm =
    spec.direction === 'short' ? SHORT_TRADE_RULES_VS_MEASUREMENTS : LONG_TRADE_RULES_VS_MEASUREMENTS
  if (!spec.success.rulesVsMeasurements) spec.success.rulesVsMeasurements = rvm
  return {
    kind: 'pattern',
    slug: spec.slug,
    title: spec.title,
    shortDescription: spec.shortDescription,
    group: 'structure',
    direction: spec.direction,
    plottedOnChart: true,
    plainEnglish: spec.plainEnglish,
    howWeCalculate: spec.howWeCalculate,
    formulaPlain: spec.formulaPlain,
    formulaFormal: spec.formulaFormal,
    workedExample: {
      narrative: spec.success.narrative,
      inputs: spec.success.setup,
      steps: spec.success.steps,
      result: spec.success.result,
      scenarios: [spec.success, spec.fail],
    },
    tipParameters: [
      ...bucketLeafKeys(spec.bucket).map((k) => tipParam(`${spec.bucket}.${k}`)),
      tipParam('atr_period', 'ATR length used as the R unit'),
    ],
    lifecycle: spec.lifecycle,
    closedCandleOnly: true,
    relatedSlugs: [
      { kind: 'pattern', slug: spec.relatedSlug.slug, label: spec.relatedSlug.label },
      { kind: 'indicator', slug: 'atr-14', label: 'ATR (14)' },
    ],
    patternTypeId: spec.slug,
    sourceDocs: spec.sourceDocs,
    sourceCode: spec.sourceCode,
    lastReviewed: '2026-08-27',
    detectorVersionHint: spec.detectorVersionHint,
    questionsItSolves: [
      'When did a classical measured-move pattern actually trigger (close through the line)?',
      'Did the virtual trade hit the measured target, the structural stop, or expire?',
    ],
    howToUse: [
      'Research default maxRiskR=1.5 hides many of these (structural stops are wide). Use the Classical measured-move preset or raise maxRiskR.',
      'A close back through the neckline/peak that does not pierce the stop keeps the family slot until stop, target, or session expiry.',
    ],
  }
}
