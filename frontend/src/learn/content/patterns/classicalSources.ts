/** Canonical public pages the classical detectors follow. Books without a free URL live in the pattern docs. */
export type ClassicalSource = { label: string; url: string; note?: string }

export const DOUBLE_BOTTOM_SOURCES: ClassicalSource[] = [
  {
    label: 'StockCharts ChartSchool — Double Bottom Reversal',
    url: 'https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/double-bottom-reversal',
    note: 'W geometry; pattern is not complete until the intervening peak breaks; measured-move target',
  },
  {
    label: 'Bulkowski — Double Bottom types',
    url: 'https://thepatternsite.com/DoubleBottomTypes.html',
    note: 'Encyclopedia of Chart Patterns identification',
  },
  {
    label: 'Bulkowski — Double Bottom setup',
    url: 'https://thepatternsite.com/dbsetup.html',
    note: 'Confirms when price closes above the intervening peak (confirmation line)',
  },
  {
    label: 'Investopedia — Double Bottom',
    url: 'https://www.investopedia.com/terms/d/doublebottom.asp',
  },
]

export const DOUBLE_TOP_SOURCES: ClassicalSource[] = [
  {
    label: 'StockCharts ChartSchool — Double Top Reversal',
    url: 'https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/double-top-reversal',
    note: 'M geometry; not complete until the intervening trough breaks; measured-move target',
  },
  {
    label: 'Bulkowski — Adam and Eve double tops',
    url: 'https://thepatternsite.com/AdamEvePatterns.html',
    note: 'Encyclopedia of Chart Patterns identification',
  },
  {
    label: 'Investopedia — Double Top',
    url: 'https://www.investopedia.com/terms/d/doubletop.asp',
  },
]

export const HEAD_SHOULDERS_SOURCES: ClassicalSource[] = [
  {
    label: 'StockCharts ChartSchool — Head and Shoulders Top',
    url: 'https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/head-and-shoulders-top',
    note: 'LS–head–RS + neckline; sloping neckline allowed; height projected from the break',
  },
  {
    label: 'Bulkowski — Head-and-Shoulders Tops',
    url: 'https://thepatternsite.com/hst.html',
    note: 'Confirms on a close through the neckline (or right armpit when the neckline slopes down)',
  },
  {
    label: 'Investopedia — Head and Shoulders',
    url: 'https://www.investopedia.com/terms/h/head-shoulders.asp',
  },
]

export const INVERSE_HEAD_SHOULDERS_SOURCES: ClassicalSource[] = [
  {
    label: 'StockCharts ChartSchool — Head and Shoulders Bottom',
    url: 'https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/head-and-shoulders-bottom',
    note: 'Inverted H&S; neckline through reaction highs; measured-move target',
  },
  {
    label: 'Bulkowski — Head-and-Shoulders Bottoms',
    url: 'https://thepatternsite.com/hsb.html',
    note: 'Encyclopedia of Chart Patterns identification',
  },
  {
    label: 'Investopedia — Inverse Head and Shoulders',
    url: 'https://www.investopedia.com/terms/i/inverseheadandshoulders.asp',
  },
]
