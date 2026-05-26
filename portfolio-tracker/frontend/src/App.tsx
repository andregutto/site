import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { CurrencyProvider } from './contexts/CurrencyContext'
import { I18nProvider } from './contexts/I18nContext'
import { supabase } from './lib/supabase'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import PerformancePage from './pages/PerformancePage'
import AssetDetailPage from './pages/AssetDetailPage'
import ContributionsPage from './pages/ContributionsPage'
import ProfilePage from './pages/ProfilePage'
import RebalancePage from './pages/RebalancePage'
import InstitutionPage from './pages/InstitutionPage'
import InstitutionsPage from './pages/InstitutionsPage'
import ClassesPage from './pages/ClassesPage'
import ReportsPage from './pages/ReportsPage'
import ImportB3Page from './pages/ImportB3Page'
import IndicesPage from './pages/IndicesPage'
import IndexDetailPage from './pages/IndexDetailPage'
import FavoritesPage from './pages/FavoritesPage'
import ArchivedPage from './pages/ArchivedPage'
import PortfolioLayout from './pages/portfolio/PortfolioLayout'
import FinancesLayout from './pages/finances/FinancesLayout'
import FinancesOverviewPage from './pages/finances/FinancesOverviewPage'
import FinancesTransactionsPage from './pages/finances/FinancesTransactionsPage'
import FinancesBudgetPage from './pages/finances/FinancesBudgetPage'
import FinancesFreedomPage from './pages/finances/FinancesFreedomPage'
import FinancesMomentsPage from './pages/finances/FinancesMomentsPage'
import AppLayout from './components/AppLayout'
import AchievementsPage from './pages/AchievementsPage'
import PrivacyPolicyPage from './pages/PrivacyPolicyPage'
import TermsOfUsePage from './pages/TermsOfUsePage'
import PublicMomentPage from './pages/PublicMomentPage'
import { AchievementProvider } from './contexts/AchievementContext'
import LandingPage from './pages/LandingPage'

function EmailConfirmGate({ email }: { email: string }) {
  const { signOut } = useAuth()
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)

  async function resend() {
    setSending(true)
    await supabase.auth.resend({ type: 'signup', email })
    setSent(true)
    setSending(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 w-full max-w-sm p-8 space-y-5 text-center">
        <div className="w-14 h-14 bg-[#0D0D0D]/10 rounded-2xl flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-[#0D0D0D]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Confirme seu e-mail</h2>
          <p className="text-sm text-gray-500 mt-2">
            Enviamos um link de confirmacao para <span className="font-medium text-gray-700">{email}</span>. Verifique sua caixa de entrada e clique no link para ativar sua conta.
          </p>
        </div>
        {sent && <p className="text-xs text-green-600">E-mail reenviado. Verifique sua caixa de entrada.</p>}
        <button
          onClick={resend}
          disabled={sending || sent}
          className="w-full border border-[#0D0D0D] text-[#0D0D0D] rounded-xl py-2.5 text-sm font-semibold hover:bg-[#0D0D0D]/5 disabled:opacity-50 transition-colors"
        >
          {sending ? 'Enviando...' : sent ? 'E-mail enviado' : 'Reenviar e-mail'}
        </button>
        <button onClick={() => signOut()} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
          Sair
        </button>
      </div>
    </div>
  )
}

function ProtectedRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm animate-pulse">Carregando...</div>
      </div>
    )
  }

  if (!user) return <Navigate to="/" replace />

  if (!user.email_confirmed_at) return <EmailConfirmGate email={user.email ?? ''} />

  return <AchievementProvider><AppLayout /></AchievementProvider>
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
      <Route path="/login"   element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/"        element={user ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
      <Route path="/privacy"                element={<PrivacyPolicyPage />} />
      <Route path="/terms"                  element={<TermsOfUsePage />} />
      <Route path="/share/momento/:token"   element={<PublicMomentPage />} />
      <Route element={<ProtectedRoutes />}>
        <Route path="/dashboard"      element={<DashboardPage />} />
        <Route path="/performance"    element={<PerformancePage />} />
        <Route path="/assets/:id"     element={<AssetDetailPage />} />
        <Route path="/profile"        element={<ProfilePage />} />
        <Route path="/institutions"          element={<InstitutionPage />} />
        <Route path="/institutions/profiles" element={<InstitutionsPage />} />
        <Route path="/import/b3"      element={<ImportB3Page />} />
        <Route path="/portfolio"      element={<PortfolioLayout />}>
          <Route index                element={<ContributionsPage />} />
          <Route path="rebalance"     element={<RebalancePage />} />
          <Route path="institutions"  element={<Navigate to="/institutions" replace />} />
          <Route path="classes"       element={<ClassesPage />} />
          <Route path="reports"       element={<ReportsPage />} />
          <Route path="indices"       element={<IndicesPage />} />
          <Route path="indices/:code" element={<IndexDetailPage />} />
        </Route>
        <Route path="/favorites"      element={<FavoritesPage />} />
        <Route path="/achievements"   element={<AchievementsPage />} />
        <Route path="/archived"       element={<ArchivedPage />} />
        <Route path="/finances"       element={<FinancesLayout />}>
          <Route index                element={<FinancesOverviewPage />} />
          <Route path="transactions"  element={<FinancesTransactionsPage />} />
          <Route path="budget"        element={<FinancesBudgetPage />} />
          <Route path="moments"       element={<FinancesMomentsPage />} />
          <Route path="freedom"       element={<FinancesFreedomPage />} />
          <Route path="accounts"      element={<Navigate to="/institutions" replace />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <I18nProvider>
          <CurrencyProvider>
            <AppRoutes />
          </CurrencyProvider>
        </I18nProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
