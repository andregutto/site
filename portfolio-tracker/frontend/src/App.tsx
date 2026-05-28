import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { CurrencyProvider } from './contexts/CurrencyContext'
import { I18nProvider, useI18n } from './contexts/I18nContext'
import { supabase } from './lib/supabase'
import ArvoLoader from './components/ArvoLoader'

function ArvoSplash() {
  useEffect(() => {
    // Body is white by default; force dark while the splash is visible so the
    // iOS safe-area / home-indicator gap below the fixed overlay doesn't flash white.
    const prev = document.body.style.background
    document.body.style.background = '#0D0D0D'
    return () => { document.body.style.background = prev }
  }, [])
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0D0D0D', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <ArvoLoader size={52} style={{ color: 'var(--arvo-gold)' }} />
    </div>
  )
}
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
import DividendsPage from './pages/DividendsPage'
import PrivacyPolicyPage from './pages/PrivacyPolicyPage'
import TermsOfUsePage from './pages/TermsOfUsePage'
import PublicMomentPage from './pages/PublicMomentPage'
import { AchievementProvider } from './contexts/AchievementContext'
import LandingPage from './pages/LandingPage'
import AcceptInvitePage from './pages/AcceptInvitePage'
import SharedCategoriesPage from './pages/finances/SharedCategoriesPage'

function EmailConfirmGate({ email }: { email: string }) {
  const { signOut } = useAuth()
  const { t } = useI18n()
  const l = t.login
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)

  async function resend() {
    setSending(true)
    await supabase.auth.resend({ type: 'signup', email })
    setSent(true)
    setSending(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--arvo-offwhite)', padding: '24px 16px' }}>
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid var(--arvo-border)', width: '100%', maxWidth: 400, padding: '40px 32px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(13,13,13,0.06)', border: '1px solid var(--arvo-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <svg style={{ width: 24, height: 24, color: 'var(--arvo-black)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
          </svg>
        </div>
        <h2 style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 20, fontWeight: 700, color: 'var(--arvo-black)', margin: '0 0 10px' }}>{l.registrationDone}</h2>
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg-soft)', lineHeight: 1.6, margin: '0 0 24px' }}>
          {l.registrationDoneBody.replace('{email}', email)}
        </p>
        {sent && <p style={{ fontSize: 12, color: '#16a34a', marginBottom: 12 }}>{l.emailResent ?? 'E-mail reenviado.'}</p>}
        <button
          onClick={resend}
          disabled={sending || sent}
          style={{ width: '100%', padding: '12px 24px', background: 'var(--arvo-black)', color: 'var(--arvo-offwhite)', fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', border: 'none', borderRadius: 6, cursor: 'pointer', opacity: sending || sent ? 0.5 : 1, marginBottom: 16 }}
        >
          {sending ? (l.loading ?? '...') : sent ? (l.emailSent ?? 'Enviado') : (l.resendEmail ?? 'Reenviar e-mail')}
        </button>
        <button onClick={() => signOut()} style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--arvo-fg-soft)', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)' }}>
          {t.nav.signout}
        </button>
      </div>
    </div>
  )
}

function DashboardGate() {
  const { user } = useAuth()
  // Only redirect on launch (first visit this session), not when user explicitly navigates here
  if (!sessionStorage.getItem('arvo_launch_redirect_done') && user?.user_metadata?.default_section === 'finances') {
    sessionStorage.setItem('arvo_launch_redirect_done', '1')
    return <Navigate to="/finances" replace />
  }
  sessionStorage.setItem('arvo_launch_redirect_done', '1')
  return <DashboardPage />
}

function ProtectedRoutes() {
  const { user, loading } = useAuth()

  if (loading) return <ArvoSplash />

  if (!user) return <Navigate to="/" replace />

  if (!user.email_confirmed_at) return <EmailConfirmGate email={user.email ?? ''} />

  return <AchievementProvider><AppLayout /></AchievementProvider>
}

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) return <ArvoSplash />

  return (
    <Routes>
      <Route path="/login"   element={user ? <Navigate to={sessionStorage.getItem('pending_invite_token') ? `/invite/${sessionStorage.getItem('pending_invite_token')}` : '/dashboard'} replace /> : <LoginPage />} />
      <Route path="/"        element={user ? <Navigate to={user.user_metadata?.default_section === 'finances' ? '/finances' : '/dashboard'} replace /> : <LandingPage />} />
      <Route path="/privacy"                element={<PrivacyPolicyPage />} />
      <Route path="/terms"                  element={<TermsOfUsePage />} />
      <Route path="/share/momento/:token"   element={<PublicMomentPage />} />
      <Route path="/invite/:token"           element={<AcceptInvitePage />} />
      <Route element={<ProtectedRoutes />}>
        <Route path="/dashboard"      element={<DashboardGate />} />
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
        <Route path="/dividends"      element={<DividendsPage />} />
        <Route path="/favorites"      element={<FavoritesPage />} />
        <Route path="/achievements"   element={<AchievementsPage />} />
        <Route path="/archived"       element={<ArchivedPage />} />
        <Route path="/finances"       element={<FinancesLayout />}>
          <Route index                element={<FinancesOverviewPage />} />
          <Route path="transactions"  element={<FinancesTransactionsPage />} />
          <Route path="budget"        element={<FinancesBudgetPage />} />
          <Route path="moments"       element={<FinancesMomentsPage />} />
          <Route path="freedom"       element={<FinancesFreedomPage />} />
          <Route path="shared"        element={<SharedCategoriesPage />} />
          <Route path="accounts"      element={<Navigate to="/institutions" replace />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
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
