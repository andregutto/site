import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { CurrencyProvider } from './contexts/CurrencyContext'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import PerformancePage from './pages/PerformancePage'
import AssetDetailPage from './pages/AssetDetailPage'
import ContributionsPage from './pages/ContributionsPage'
import ProfilePage from './pages/ProfilePage'
import RebalancePage from './pages/RebalancePage'
import InstitutionPage from './pages/InstitutionPage'
import InstitutionsPage from './pages/InstitutionsPage'
import AppLayout from './components/AppLayout'

function ProtectedRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm animate-pulse">Carregando...</div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  return <AppLayout />
}

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-400 text-sm animate-pulse">Carregando...</div>
    </div>
  )

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route element={<ProtectedRoutes />}>
        <Route path="/"               element={<DashboardPage />} />
        <Route path="/performance"    element={<PerformancePage />} />
        <Route path="/assets/:id"     element={<AssetDetailPage />} />
        <Route path="/contributions"  element={<ContributionsPage />} />
        <Route path="/profile"        element={<ProfilePage />} />
        <Route path="/rebalance"      element={<RebalancePage />} />
        <Route path="/by-institution" element={<InstitutionPage />} />
        <Route path="/institutions"   element={<InstitutionsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CurrencyProvider>
          <AppRoutes />
        </CurrencyProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
