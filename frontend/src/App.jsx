import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import RequireAuth from './auth/RequireAuth'
import ChartContainer from './components/ChartContainer'
import ErrorBoundary from './components/ErrorBoundary'
import AppShell from './components/shell/AppShell'
import AdminUsersPage from './pages/AdminUsersPage'
import LoginPage from './pages/LoginPage'
import PaperOrdersPage from './pages/PaperOrdersPage'
import PaperTradingPage from './pages/PaperTradingPage'
import PatternStatsPage from './pages/PatternStatsPage'
import './App.css'
import './pages/authPages.css'
import './styles/tokens.css'

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route
                index
                element={
                  <ErrorBoundary>
                    <ChartContainer key="chart-home" />
                  </ErrorBoundary>
                }
              />
              <Route
                path="paper"
                element={
                  <ErrorBoundary>
                    <PaperTradingPage key="paper-trading" />
                  </ErrorBoundary>
                }
              />
              <Route
                path="paper/orders"
                element={
                  <ErrorBoundary>
                    <PaperOrdersPage key="paper-orders" />
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
