import { describe, expect, it } from 'vitest'
import { indicatorMenuItems } from './ChartIndicatorsMenu'

describe('indicatorMenuItems', () => {
  it('lists ATR and volume; Woodie only when available', () => {
    expect(
      indicatorMenuItems({
        showAtr: true,
        showVolume: false,
        showWoodie: true,
        woodieAvailable: false,
      }).map((i) => i.id),
    ).toEqual(['atr', 'volume'])
    expect(
      indicatorMenuItems({
        showAtr: true,
        showVolume: true,
        showWoodie: false,
        woodieAvailable: true,
      }).map((i) => i.id),
    ).toEqual(['atr', 'volume', 'woodie'])
  })

  it('mirrors checked state', () => {
    const items = indicatorMenuItems({
      showAtr: false,
      showVolume: true,
      showWoodie: true,
      woodieAvailable: true,
    })
    expect(items.find((i) => i.id === 'atr')?.checked).toBe(false)
    expect(items.find((i) => i.id === 'volume')?.checked).toBe(true)
    expect(items.find((i) => i.id === 'woodie')?.checked).toBe(true)
  })
})
