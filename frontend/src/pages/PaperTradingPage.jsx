import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import {
  cancelPaperOrder,
  fetchPaperAccount,
  fetchPaperOrders,
  fetchPaperPositions,
  placePaperOrder,
} from '../services/paperApi'
import { fetchWatchlist } from '../services/watchlistApi'
import './paperTrading.css'

function money(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function PaperTradingPage() {
  const { user, logout } = useAuth()
  const [account, setAccount] = useState(null)
  const [orders, setOrders] = useState([])
  const [positions, setPositions] = useState([])
  const [symbols, setSymbols] = useState([])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    instrumentKey: '',
    side: 'BUY',
    orderType: 'MARKET',
    product: 'MIS',
    qty: 1,
    price: '',
    triggerPrice: '',
    closeLotId: '',
  })

  const tradable = useMemo(() => {
    return (symbols || []).filter((s) => {
      const seg = (s.segment || '').toUpperCase()
      const itype = (s.instrumentType || '').toUpperCase()
      if (!s.active) return false
      if (seg.includes('INDEX') || (s.symbolId || '').startsWith('NSE_INDEX')) return false
      if (seg !== 'NSE_EQ') return false
      return itype === 'EQ' || itype === 'BE'
    })
  }, [symbols])

  const refresh = useCallback(async () => {
    if (document.hidden) return
    try {
      const [acc, ords, pos, wl] = await Promise.all([
        fetchPaperAccount(),
        fetchPaperOrders(),
        fetchPaperPositions(true),
        fetchWatchlist().catch(() => []),
      ])
      setAccount(acc)
      setOrders(ords)
      setPositions(pos)
      setSymbols(Array.isArray(wl) ? wl : [])
      setError(null)
    } catch (e) {
      setError(e?.message || String(e))
    }
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 3000)
    return () => clearInterval(t)
  }, [refresh])

  useEffect(() => {
    if (!form.instrumentKey && tradable.length) {
      setForm((f) => ({ ...f, instrumentKey: tradable[0].symbolId }))
    }
  }, [tradable, form.instrumentKey])

  async function onSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const body = {
        instrumentKey: form.instrumentKey,
        side: form.side,
        orderType: form.orderType,
        product: form.product,
        qty: Number(form.qty),
      }
      if (form.price !== '' && form.price != null) body.price = Number(form.price)
      if (form.triggerPrice !== '' && form.triggerPrice != null) {
        body.triggerPrice = Number(form.triggerPrice)
      }
      if (form.closeLotId) body.closeLotId = form.closeLotId
      await placePaperOrder(body)
      await refresh()
    } catch (err) {
      setError(err?.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onCancel(id) {
    setBusy(true)
    try {
      await cancelPaperOrder(id)
      await refresh()
    } catch (err) {
      setError(err?.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  function closeLot(pos) {
    setForm((f) => ({
      ...f,
      instrumentKey: pos.instrumentKey,
      side: pos.side === 'LONG' ? 'SELL' : 'BUY',
      orderType: 'MARKET',
      product: pos.product,
      qty: pos.qtyOpen,
      closeLotId: pos.id,
      price: '',
      triggerPrice: '',
    }))
  }

  const openOrders = orders.filter((o) =>
    ['OPEN', 'TRIGGER_PENDING', 'PARTIALLY_FILLED'].includes(o.status),
  )

  return (
    <div className="paper-page">
      <header className="paper-page__header">
        <div>
          <p className="paper-badge">PAPER</p>
          <h1>Paper trading</h1>
          <p className="paper-page__sub">
            Simulated OMS — live tick fills · no real broker · {user?.username || 'user'}
          </p>
        </div>
        <nav className="paper-page__nav">
          <Link to="/">Chart</Link>
          <Link to="/patterns/stats">Stats</Link>
          <button type="button" className="paper-link-btn" onClick={() => logout?.()}>
            Log out
          </button>
        </nav>
      </header>

      {error && <div className="paper-error">{error}</div>}

      <section className="paper-account">
        <div>
          <span>Cash</span>
          <strong>₹{money(account?.cashBalance)}</strong>
        </div>
        <div>
          <span>Locked</span>
          <strong>₹{money(account?.lockedCash)}</strong>
        </div>
        <div>
          <span>Free</span>
          <strong>₹{money(account?.freeCash)}</strong>
        </div>
      </section>

      <div className="paper-grid">
        <form className="paper-ticket" onSubmit={onSubmit}>
          <h2>Order ticket</h2>
          <label>
            Symbol
            <select
              value={form.instrumentKey}
              onChange={(e) => setForm({ ...form, instrumentKey: e.target.value, closeLotId: '' })}
              required
            >
              {tradable.map((s) => (
                <option key={s.symbolId} value={s.symbolId}>
                  {s.tradingSymbol || s.symbolId}
                </option>
              ))}
            </select>
          </label>
          <div className="paper-row">
            <label>
              Side
              <select value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value })}>
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
            </label>
            <label>
              Product
              <select
                value={form.product}
                onChange={(e) => setForm({ ...form, product: e.target.value })}
              >
                <option value="MIS">MIS (intraday)</option>
                <option value="CNC">CNC (overnight)</option>
              </select>
            </label>
          </div>
          <div className="paper-row">
            <label>
              Type
              <select
                value={form.orderType}
                onChange={(e) => setForm({ ...form, orderType: e.target.value })}
              >
                <option value="MARKET">MARKET</option>
                <option value="LIMIT">LIMIT</option>
                <option value="SL">SL</option>
                <option value="SL_M">SL-M</option>
              </select>
            </label>
            <label>
              Qty
              <input
                type="number"
                min={1}
                step={1}
                value={form.qty}
                onChange={(e) => setForm({ ...form, qty: e.target.value })}
                required
              />
            </label>
          </div>
          {(form.orderType === 'LIMIT' || form.orderType === 'SL') && (
            <label>
              Price
              <input
                type="number"
                step="0.05"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                required
              />
            </label>
          )}
          {(form.orderType === 'SL' || form.orderType === 'SL_M') && (
            <label>
              Trigger
              <input
                type="number"
                step="0.05"
                value={form.triggerPrice}
                onChange={(e) => setForm({ ...form, triggerPrice: e.target.value })}
                required
              />
            </label>
          )}
          {form.closeLotId && (
            <p className="paper-hint">Closing lot {form.closeLotId.slice(0, 8)}…</p>
          )}
          <button type="submit" disabled={busy || !tradable.length}>
            {busy ? 'Working…' : 'Place paper order'}
          </button>
        </form>

        <section className="paper-panel">
          <h2>Open positions</h2>
          <div className="paper-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th>Prod</th>
                  <th>Qty</th>
                  <th>Avg</th>
                  <th>LTP</th>
                  <th>uPnL</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {positions.length === 0 && (
                  <tr>
                    <td colSpan={8}>No open lots</td>
                  </tr>
                )}
                {positions.map((p) => (
                  <tr key={p.id}>
                    <td>{p.tradingSymbol}</td>
                    <td>{p.side}</td>
                    <td>{p.product}</td>
                    <td>{p.qtyOpen}</td>
                    <td>{money(p.avgEntryPrice)}</td>
                    <td>{money(p.ltp)}</td>
                    <td className={p.unrealizedPnl >= 0 ? 'pnl-pos' : 'pnl-neg'}>
                      {money(p.unrealizedPnl)}
                    </td>
                    <td>
                      <button type="button" className="paper-mini" onClick={() => closeLot(p)}>
                        Close
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="paper-panel paper-panel--wide">
          <h2>Open orders</h2>
          <div className="paper-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th>Type</th>
                  <th>Prod</th>
                  <th>Qty</th>
                  <th>Filled</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {openOrders.length === 0 && (
                  <tr>
                    <td colSpan={8}>No open orders</td>
                  </tr>
                )}
                {openOrders.map((o) => (
                  <tr key={o.id}>
                    <td>{o.tradingSymbol}</td>
                    <td>{o.side}</td>
                    <td>{o.orderType}</td>
                    <td>{o.product}</td>
                    <td>{o.qty}</td>
                    <td>{o.filledQty}</td>
                    <td>{o.status}</td>
                    <td>
                      <button
                        type="button"
                        className="paper-mini"
                        disabled={busy}
                        onClick={() => onCancel(o.id)}
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2 className="paper-h2-sp">Recent orders</h2>
          <div className="paper-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Filled</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 30).map((o) => (
                  <tr key={o.id}>
                    <td>{o.tradingSymbol}</td>
                    <td>{o.side}</td>
                    <td>{o.orderType}</td>
                    <td>{o.status}</td>
                    <td>
                      {o.filledQty}/{o.qty}
                    </td>
                    <td>{o.rejectReason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
