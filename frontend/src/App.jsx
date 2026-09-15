import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import RequireAuth from './auth/RequireAuth'
import ChartContainer from './components/ChartContainer'
import ErrorBoundary from './components/ErrorBoundary'
import AppShell from './components/shell/AppShell'
import { legacyAdminLearnToStandalone } from './learn/routing'
import { isAdminLearnEnabled } from './config/featureFlags'
import AdminUsersPage from './pages/AdminUsersPage'
import LearnDetailPage from './pages/LearnDetailPage'
import LearnIndexPage from './pages/LearnIndexPage'
import LoginPage from './pages/LoginPage'
import PaperOrdersPage from './pages/PaperOrdersPage'
import PaperTradingPage from './pages/PaperTradingPage'
import PatternStatsPage from './pages/PatternStatsPage'
import './App.css'
import './pages/authPages.css'
import './styles/tokens.css'

/** Preserve topic when redirecting old /admin/learn/* bookmarks. */
function LegacyAdminLearnRedirect() {
  const location = useLocation()
  const to = legacyAdminLearnToStandalone(location.pathname)
  return <Navigate to={to} replace />
}

function RequireLearnFlag({ children }) {
  if (!isAdminLearnEnabled()) return <Navigate to="/" replace />
  return children
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route element={<AppShell />}>
              <Route
                index
                element={
                  <ErrorBoundary>
                    <ChartContainer key="chart-home" />
                  </ErrorBoundary>
                }
              />
              <Route
                path="patterns/stats"
                element={
                  <ErrorBoundary>
                    <PatternStatsPage key="pattern-stats" />
                  </ErrorBoundary>
                }
              />
              <Route
                path="learn"
                element={
                  <RequireLearnFlag>
                    <ErrorBoundary>
                      <LearnIndexPage key="learn-index" />
                    </ErrorBoundary>
                  </RequireLearnFlag>
                }
              />
              <Route
                path="learn/:kind/:slug"
                element={
                  <RequireLearnFlag>
                    <ErrorBoundary>
                      <LearnDetailPage key="learn-detail" />
                    </ErrorBoundary>
                  </RequireLearnFlag>
                }
              />
              <Route
                path="paper"
                element={
                  <RequireAuth>
                    <ErrorBoundary>
                      <PaperTradingPage key="paper-trading" />
                    </ErrorBoundary>
                  </RequireAuth>
                }
              />
              <Route
                path="paper/orders"
                element={
                  <RequireAuth>
                    <ErrorBoundary>
                      <PaperOrdersPage key="paper-orders" />
                    </ErrorBoundary>
                  </RequireAuth>
                }
              />
              <Route
                path="admin/users"
                element={
                  <RequireAuth adminOnly>
                    <ErrorBoundary>
                      <AdminUsersPage key="admin-users" />
                    </ErrorBoundary>
                  </RequireAuth>
                }
              />
            </Route>

            <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
            {/* Old nested URLs after Learn was moved out of Admin */}
            <Route path="/admin/learn/*" element={<LegacyAdminLearnRedirect />} />
            <Route path="/admin/learn" element={<LegacyAdminLearnRedirect />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
