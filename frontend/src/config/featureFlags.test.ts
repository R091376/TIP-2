import { afterEach, describe, expect, it, vi } from 'vitest'

describe('isStartupReadyEnabled', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('defaults to ON when unset', async () => {
    vi.stubEnv('VITE_FEATURE_STARTUP_READY', '')
    const { isStartupReadyEnabled } = await import('./featureFlags')
    expect(isStartupReadyEnabled()).toBe(true)
  })

  it('can be turned off', async () => {
    vi.stubEnv('VITE_FEATURE_STARTUP_READY', 'false')
    const { isStartupReadyEnabled } = await import('./featureFlags')
    expect(isStartupReadyEnabled()).toBe(false)
  })

  it('accepts true/1/on', async () => {
    vi.stubEnv('VITE_FEATURE_STARTUP_READY', 'on')
    const { isStartupReadyEnabled } = await import('./featureFlags')
    expect(isStartupReadyEnabled()).toBe(true)
  })
})

describe('isChartPaperTradeEnabled', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('defaults to ON when unset', async () => {
    vi.stubEnv('VITE_FEATURE_CHART_PAPER_TRADE', '')
    const { isChartPaperTradeEnabled } = await import('./featureFlags')
    expect(isChartPaperTradeEnabled()).toBe(true)
  })

  it('can be turned off', async () => {
    vi.stubEnv('VITE_FEATURE_CHART_PAPER_TRADE', 'false')
    const { isChartPaperTradeEnabled } = await import('./featureFlags')
    expect(isChartPaperTradeEnabled()).toBe(false)
  })

  it('accepts true/1/on', async () => {
    for (const v of ['true', '1', 'on']) {
      vi.resetModules()
      vi.stubEnv('VITE_FEATURE_CHART_PAPER_TRADE', v)
      const { isChartPaperTradeEnabled } = await import('./featureFlags')
      expect(isChartPaperTradeEnabled()).toBe(true)
    }
  })
})

describe('isAppShellEnabled', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('defaults to ON when unset', async () => {
    vi.stubEnv('VITE_FEATURE_APP_SHELL', '')
    const { isAppShellEnabled } = await import('./featureFlags')
    expect(isAppShellEnabled()).toBe(true)
  })

  it('can be turned off via env', async () => {
    vi.stubEnv('VITE_FEATURE_APP_SHELL', 'false')
    const { isAppShellEnabled } = await import('./featureFlags')
    expect(isAppShellEnabled()).toBe(false)
  })
})

describe('isTimeframe1mEnabled', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('defaults to OFF when unset', async () => {
    vi.stubEnv('VITE_FEATURE_TIMEFRAME_1M', '')
    const { isTimeframe1mEnabled } = await import('./featureFlags')
    expect(isTimeframe1mEnabled()).toBe(false)
  })

  it('can be turned on', async () => {
    vi.stubEnv('VITE_FEATURE_TIMEFRAME_1M', 'true')
    const { isTimeframe1mEnabled } = await import('./featureFlags')
    expect(isTimeframe1mEnabled()).toBe(true)
  })
})

describe('getDefaultTimeframes', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('omits 1m when the flag is off', async () => {
    vi.stubEnv('VITE_FEATURE_TIMEFRAME_1M', 'false')
    const { getDefaultTimeframes } = await import('../services/marketApi')
    expect(getDefaultTimeframes()).toEqual(['5m', '15m', '1h', '4h', '1d'])
  })

  it('includes 1m when the flag is on', async () => {
    vi.stubEnv('VITE_FEATURE_TIMEFRAME_1M', 'true')
    const { getDefaultTimeframes } = await import('../services/marketApi')
    expect(getDefaultTimeframes()[0]).toBe('1m')
  })
})

describe('isAdminLearnEnabled', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('defaults to ON when unset (content shipped)', async () => {
    vi.stubEnv('VITE_FEATURE_ADMIN_LEARN', '')
    const { isAdminLearnEnabled } = await import('./featureFlags')
    expect(isAdminLearnEnabled()).toBe(true)
  })

  it('can be turned off', async () => {
    vi.stubEnv('VITE_FEATURE_ADMIN_LEARN', 'false')
    const { isAdminLearnEnabled } = await import('./featureFlags')
    expect(isAdminLearnEnabled()).toBe(false)
  })
})
