import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import PaperPageChrome from '../components/PaperPageChrome'
import {
  fetchPaperAccount,
  fetchPaperFills,
  fetchPaperOrders,
  fetchPaperPositions,
  parsePaperApiError,
  placePaperOrder,
} from '../services/paperApi'
import { computePaperPnl } from '../utils/paperPnl'
import './paperTrading.css'

function money(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function pnlClass(n) {
  if (n == null || Number.isNaN(n)) return ''
  if (n > 0) return 'pnl-pos'
  if (n < 0) return 'pnl-neg'
  return ''
}

function newClientOrderId(prefix, extra = '') {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}${extra ? `${extra}-` : ''}${uuid}`.slice(0, 64)
}

export default function PaperTradingPage() {
  const { user, isAdmin, logout } = useAuth()
  const [account, setAccount] = useState(null)
  const [allLots, setAllLots] = useState([])
  const [orders, setOrders] = useState([])
  const [fills, setFills] = useState([])
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const refresh = useCallback(async (opts = {}) => {
    const force = Boolean(opts.force)
    if (!force && document.hidden) return
    try {
      const [acc, lots, ords, fl] = await Promise.all([
        fetchPaperAccount(),
        fetchPaperPositions(false),
        fetchPaperOrders(undefined, { limit: 500 }),
        fetchPaperFills({ limit: 500 }),
      ])
      setAccount(acc)
      setAllLots(Array.isArray(lots) ? lots : [])
      setOrders(Array.isArray(ords) ? ords : [])
      setFills(Array.isArray(fl) ? fl : [])
      setError(null)
    } catch (e) {
      const { code, message } = parsePaperApiError(e)
      setError(code ? `${code} — ${message}` : message)
    }
  }, [])

  useEffect(() => {
    refresh({ force: true })
    const t = setInterval(() => refresh(), 3000)
    return () => clearInterval(t)
  }, [refresh])

  const openPositions = useMemo(
    () => allLots.filter((p) => (p.status || '').toUpperCase() === 'OPEN'),
    [allLots],
  )

  const pnl = useMemo(
    () => computePaperPnl(allLots, { fills, orders }),
    [allLots, fills, orders],
  )

  async function onCloseLot(pos) {
    if (!pos?.id) return
    setBusyId(pos.id)
    setError(null)
    try {
      await placePaperOrder({
        instrumentKey: pos.instrumentKey,
        side: pos.side === 'LONG' ? 'SELL' : 'BUY',
        orderType: 'MARKET',
        product: pos.product,
        qty: pos.qtyOpen,
        closeLotId: pos.id,
        clientOrderId: newClientOrderId('desk-close-', pos.id.slice(0, 8)),
      })
      await refresh({ force: true })
    } catch (err) {
      const { code, message } = parsePaperApiError(err)
      setError(code ? `${code} — ${message}` : message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="paper-page">
      <PaperPageChrome
        user={user}
        isAdmin={isAdmin}
        onLogout={() => logout?.()}
        title="Paper desk"
        subtitle="Positions & P&L · place trades from the chart · no real broker"
      />

      {error && (
        <div className="paper-error" role="alert">
          {error}
        </div>
      )}

      <section className="paper-account" aria-label="Account balances">
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

      <section className="paper-pnl" aria-label="Profit and loss">
        <div className="paper-pnl__card paper-pnl__card--day">
          <h2 className="paper-pnl__title">Today (IST)</h2>
          <div className={`paper-pnl__total ${pnlClass(pnl.dayTotal)}`}>
            <span className="paper-pnl__total-label">Day P&amp;L</span>
            <strong>₹{money(pnl.dayTotal)}</strong>
          </div>
          <dl className="paper-pnl__breakdown">
            <div>
              <dt title="Realized on close/cover fills with fill time today (IST)">
                Realized
              </dt>
              <dd className={pnlClass(pnl.dayRealized)}>₹{money(pnl.dayRealized)}</dd>
            </div>
            <div>
              <dt title="Mark-to-market of all open lots (not change since prior close)">
                Open MTM
              </dt>
              <dd className={pnlClass(pnl.dayUnrealized)}>₹{money(pnl.dayUnrealized)}</dd>
            </div>
          </dl>
        </div>
        <div className="paper-pnl__card paper-pnl__card--overall">
          <h2 className="paper-pnl__title">Overall</h2>
          <div className={`paper-pnl__total ${pnlClass(pnl.overallTotal)}`}>
            <span className="paper-pnl__total-label">Total P&amp;L</span>
            <strong>₹{money(pnl.overallTotal)}</strong>
          </div>
          <dl className="paper-pnl__breakdown">
            <div>
              <dt>Realized</dt>
              <dd className={pnlClass(pnl.overallRealized)}>₹{money(pnl.overallRealized)}</dd>
            </div>
            <div>
              <dt>Unrealized</dt>
              <dd className={pnlClass(pnl.overallUnrealized)}>
                ₹{money(pnl.overallUnrealized)}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <p className="paper-desk-hint">
        Place new orders from the chart ·{' '}
        <Link to="/paper/orders">Open &amp; closed orders</Link> · Day realized =
        close/cover fills today (IST); Open MTM = all open mark-to-market.
      </p>

      <div className="paper-desk">
        <section
          className="paper-section paper-section--positions"
          aria-labelledby="paper-pos-heading"
        >
          <div className="paper-section__head">
            <h2 id="paper-pos-heading">Open positions</h2>
            <span className="paper-section__count">{openPositions.length}</span>
          </div>
          {openPositions.length === 0 ? (
            <p className="paper-empty">No open lots</p>
          ) : (
            <div className="paper-pos-grid">
              {openPositions.map((p) => {
                const u = p.unrealizedPnl
                return (
                  <article key={p.id} className="paper-pos-card">
                    <div className="paper-pos-card__top">
                      <div>
                        <h3 className="paper-pos-card__symbol">{p.tradingSymbol}</h3>
                        <p className="paper-pos-card__meta">
                          <span
                            className={
                              p.side === 'LONG'
                                ? 'paper-side paper-side--long'
                                : 'paper-side paper-side--short'
                            }
                          >
                            {p.side}
                          </span>
                          <span className="paper-chip">{p.product}</span>
                          <span className="paper-chip">{p.qtyOpen} qty</span>
                        </p>
                      </div>
                      <div className={`paper-pos-card__pnl ${pnlClass(u)}`}>
                        <span className="paper-pos-card__pnl-label">uPnL</span>
                        <strong>₹{money(u)}</strong>
                      </div>
                    </div>
                    <dl className="paper-pos-card__stats">
                      <div>
                        <dt>Avg</dt>
                        <dd>₹{money(p.avgEntryPrice)}</dd>
                      </div>
                      <div>
                        <dt>LTP</dt>
                        <dd>₹{money(p.ltp)}</dd>
                      </div>
                      <div>
                        <dt>Realized</dt>
                        <dd className={pnlClass(p.realizedPnl)}>
                          ₹{money(p.realizedPnl)}
                        </dd>
                      </div>
                    </dl>
                    <button
                      type="button"
                      className="paper-pos-card__close"
                      disabled={busyId === p.id}
                      onClick={() => onCloseLot(p)}
                    >
                      {busyId === p.id ? 'Closing…' : 'Close lot (MARKET)'}
                    </button>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
