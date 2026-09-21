import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./http', () => ({
  api: vi.fn(),
}))

import { api } from './http'
import { previewPaperCharges } from './paperApi'

describe('previewPaperCharges', () => {
  beforeEach(() => {
    vi.mocked(api).mockReset()
  })

  it('POSTs orderType on /api/paper/charges/preview', async () => {
    vi.mocked(api).mockResolvedValue({
      enabled: true,
      scheduleId: 'nse_eq_cash_v1',
      notional: 1000,
      charges: [{ code: 'BROKERAGE', amount: 0.3 }],
      chargesTotal: 0.42,
      cashEffect: -1000.42,
      lockEstimate: 1000.42,
      lockPrice: 100,
    })
    const body = {
      instrumentKey: 'NSE_EQ|RELIANCE',
      side: 'BUY',
      orderType: 'MARKET',
      product: 'MIS',
      qty: 10,
      price: 100,
    }
    const res = await previewPaperCharges(body)
    expect(api).toHaveBeenCalledWith('/api/paper/charges/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(res.chargesTotal).toBe(0.42)
    const sent = JSON.parse(String(vi.mocked(api).mock.calls[0][1]?.body))
    expect(sent.orderType).toBe('MARKET')
  })
})
