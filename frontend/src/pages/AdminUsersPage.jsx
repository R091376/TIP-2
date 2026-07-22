import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import UserAccountMenu from '../components/UserAccountMenu'
import {
  createUser,
  listUsers,
  resetAccount,
  seedCash,
  setPassword,
  setTradingEnabled,
  updateUser,
} from '../services/adminUsersApi'
import '../styles/userAccount.css'
import './authPages.css'

function money(n) {
  if (n == null || n === '') return '—'
  const v = Number(n)
  if (Number.isNaN(v)) return String(n)
  try {
    return v.toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    })
  } catch {
    return `₹${v.toFixed(2)}`
  }
}

export default function AdminUsersPage() {
  const { user, logout } = useAuth()
  const [users, setUsers] = useState([])
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState({
    username: '',
    password: '',
    displayName: '',
    role: 'USER',
    seedCash: '100000',
  })

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await listUsers()
      setUsers(Array.isArray(rows) ? rows : [])
    } catch (e) {
      setUsers([])
      setError(e instanceof Error ? e.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function onCreate(e) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    try {
      await createUser({
        username: form.username.trim(),
        password: form.password,
        displayName: form.displayName.trim() || null,
        role: form.role,
        seedCash: form.seedCash ? Number(form.seedCash) : null,
      })
      setForm({ username: '', password: '', displayName: '', role: 'USER', seedCash: '100000' })
      setInfo('User created')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
    }
  }

  async function runAction(label, fn) {
    setError(null)
    setInfo(null)
    try {
      await fn()
      setInfo(label)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <h1 className="admin-header__title">Admin · Users</h1>
          <p className="admin-header__sub">
            Signed in as <strong>{user?.username || '—'}</strong>
            {user?.role ? ` · ${user.role}` : ''}
          </p>
        </div>
        <div className="admin-header__actions">
          <Link to="/" className="admin-link">
            ← Chart
          </Link>
          <Link to="/patterns/stats" className="admin-link">
            Stats
          </Link>
          <UserAccountMenu user={user} onLogout={() => logout()} />
        </div>
      </header>

      {error && <div className="admin-banner admin-banner--error">{error}</div>}
      {info && <div className="admin-banner admin-banner--ok">{info}</div>}

      <section className="admin-card">
        <h2>Create user</h2>
        <form className="admin-form" onSubmit={onCreate}>
          <label>
            Username
            <input
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              required
              minLength={3}
              autoComplete="off"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required
              minLength={4}
              autoComplete="new-password"
            />
          </label>
          <label>
            Display name
            <input
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
            />
          </label>
          <label>
            Role
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            >
              <option value="USER">USER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </label>
          <label>
            Seed cash (INR)
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.seedCash}
              onChange={(e) => setForm((f) => ({ ...f, seedCash: e.target.value }))}
            />
          </label>
          <button type="submit" className="admin-btn">
            Create
          </button>
        </form>
      </section>

      <section className="admin-card">
        <div className="admin-card__head">
          <h2>Users {loading ? '…' : `(${users.length})`}</h2>
          <button type="button" className="admin-btn admin-btn--small" onClick={() => refresh()}>
            Refresh
          </button>
        </div>

        {loading && users.length === 0 ? (
          <p className="admin-empty">Loading users…</p>
        ) : users.length === 0 ? (
          <p className="admin-empty">No users returned. Check the error banner or click Refresh.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Cash</th>
                  <th>Trading</th>
                  <th>Active</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const id = u.id
                  const role = String(u.role || 'USER')
                  return (
                    <tr key={id || u.username}>
                      <td>
                        <div className="admin-user-cell">
                          <strong>{u.username}</strong>
                          {u.displayName ? <span>{u.displayName}</span> : null}
                        </div>
                      </td>
                      <td>
                        <span className={`admin-pill admin-pill--${role.toLowerCase()}`}>
                          {role}
                        </span>
                      </td>
                      <td className="admin-mono">{money(u.cashBalance)}</td>
                      <td>{u.tradingEnabled ? 'On' : 'Off'}</td>
                      <td>{u.active ? 'Yes' : 'No'}</td>
                      <td>
                        <div className="admin-row-actions">
                          <button
                            type="button"
                            className="admin-btn admin-btn--small"
                            onClick={() =>
                              runAction('Trading toggled', () =>
                                setTradingEnabled(id, !u.tradingEnabled),
                              )
                            }
                          >
                            {u.tradingEnabled ? 'Disable trade' : 'Enable trade'}
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn--small"
                            onClick={() => {
                              const amt = window.prompt('Top-up amount (INR)', '10000')
                              if (amt == null || amt === '') return
                              runAction('Cash seeded', () => seedCash(id, Number(amt)))
                            }}
                          >
                            Seed cash
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn--small"
                            onClick={() => {
                              if (!window.confirm(`Reset ${u.username} cash to default seed?`)) {
                                return
                              }
                              runAction('Account reset', () => resetAccount(id))
                            }}
                          >
                            Reset cash
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn--small"
                            onClick={() => {
                              const pw = window.prompt(`New password for ${u.username}`)
                              if (!pw) return
                              runAction('Password set', () => setPassword(id, pw))
                            }}
                          >
                            Password
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn--small"
                            onClick={() =>
                              runAction(u.active ? 'User deactivated' : 'User activated', () =>
                                updateUser(id, { active: !u.active }),
                              )
                            }
                          >
                            {u.active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
