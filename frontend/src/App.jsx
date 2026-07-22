import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import RequireAuth from './auth/RequireAuth'
import ChartContainer from './components/ChartContainer'
import ErrorBoundary from './components/ErrorBoundary'
import AdminUsersPage from './pages/AdminUsersPage'
import LoginPage from './pages/LoginPage'
import PatternStatsPage from './pages/PatternStatsPage'
import './App.css'
import './pages/authPages.css'

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <ErrorBoundary>
                    {/* key forces a clean chart mount when returning from admin */}
                    <ChartContainer key="chart-home" />
                  </ErrorBoundary>
                </RequireAuth>
              }
            />
            <Route
              path="/patterns/stats"
              element={
                <RequireAuth>
                  <ErrorBoundary>
                    <PatternStatsPage key="pattern-stats" />
                  </ErrorBoundary>
                </RequireAuth>
              }
            />
            <Route
              path="/admin/users"
              element={
                <RequireAuth adminOnly>
                  <ErrorBoundary>
                    <AdminUsersPage key="admin-users" />
                  </ErrorBoundary>
                </RequireAuth>
              }
            />
            <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
