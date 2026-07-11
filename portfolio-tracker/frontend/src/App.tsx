import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { CurrencyProvider } from './contexts/CurrencyContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { I18nProvider, useI18n } from './contexts/I18nContext'
import { supabase } from './lib/supabase'
import ArvoSplash from './components/ArvoSplash'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import AssetsPage from './pages/AssetsPage'
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
import DiversificationPage from './pages/DiversificationPage'
import PortfolioLayout from './pages/portfolio/PortfolioLayout'
import FinancesLayout from './pages/finances/FinancesLayout'
import FinancesOverviewPage from './pages/finances/FinancesOverviewPage'
import FinancesTransactionsPage from './pages/finances/FinancesTransactionsPage'
import FinancesBudgetPage from './pages/finances/FinancesBudgetPage'
import FinancesFreedomPage from './pages/finances/FinancesFreedomPage'
import FinancesMomentsPage from './pages/finances/FinancesMomentsPage'
import MomentDetailPage from './pages/finances/MomentDetailPage'
import AppLayout from './components/AppLayout'
import AchievementsPage from './pages/AchievementsPage'
import NotificationsPage from './pages/NotificationsPage'
import DividendsPage from './pages/DividendsPage'
import PrivacyPolicyPage from './pages/PrivacyPolicyPage'
import TermsOfUsePage from './pages/TermsOfUsePage'
import PublicMomentPage from './pages/PublicMomentPage'
import PublicPortfolioPage from './pages/PublicPortfolioPage'
import { AchievementProvider } from './contexts/AchievementContext'
import { NotificationsProvider } from './contexts/NotificationsContext'
import LandingPage from './pages/LandingPage'
import AcceptInvitePage from './pages/AcceptInvitePage'
import FinancesInsightsPage from './pages/finances/FinancesInsightsPage'
import AccountsPage from './pages/finances/AccountsPage'
import VoyageLayout from './pages/voyage/VoyageLayout'
import VoyageTripsPage from './pages/voyage/VoyageTripsPage'
import VoyageTripDetailPage from './pages/voyage/VoyageTripDetailPage'
import VoyagePlacesPage from './pages/voyage/VoyagePlacesPage'
import VoyageMapPage from './pages/voyage/VoyageMapPage'
import AcceptTripInvitePage from './pages/voyage/AcceptTripInvitePage'
import AcceptMomentInvitePage from './pages/finances/AcceptMomentInvitePage'
import PublicTripPage from './pages/voyage/PublicTripPage'
import SharedTripGatePage from './pages/voyage/SharedTripGatePage'
import SharedTripViewPage from './pages/voyage/SharedTripViewPage'
import PeoplePage from './pages/PeoplePage'
import CommunityLayout from './pages/community/CommunityLayout'
import CommunityHomePage from './pages/community/CommunityHomePage'
import CommunityCategoryPage from './pages/community/CommunityCategoryPage'
import CommunityTopicPage from './pages/community/CommunityTopicPage'
import CommunityTripsPage from './pages/community/CommunityTripsPage'
import UserProfilePage from './pages/UserProfilePage'
import HomePage from './pages/HomePage'
import { MessagingProvider } from './contexts/MessagingContext'
import MessagesPage from './pages/messages/MessagesPage'
import ConversationPage from './pages/messages/ConversationPage'
import ResourcesPage from './pages/ResourcesPage'
import ResourcePublicPage from './pages/ResourcePublicPage'
import ResourceDetailPage from './pages/ResourceDetailPage'
import AdminPage from './pages/AdminPage'
import PlansPage from './pages/PlansPage'
import { UpgradeProvider } from './contexts/UpgradeContext'
import GateGuard from './components/upgrade/GateGuard'
import ErrorBoundary from './components/ErrorBoundary'

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
        {sent && <p style={{ fontSize: 13, color: '#16a34a', marginBottom: 12 }}>{l.emailResent ?? 'E-mail reenviado.'}</p>}
        <button
          onClick={resend}
          disabled={sending || sent}
          style={{ width: '100%', padding: '12px 24px', background: 'var(--arvo-black)', color: 'var(--arvo-offwhite)', fontFamily: 'var(--arvo-font-body)', fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', border: 'none', borderRadius: 6, cursor: 'pointer', opacity: sending || sent ? 0.5 : 1, marginBottom: 16 }}
        >
          {sending ? (l.loading ?? '...') : sent ? (l.emailSent ?? 'Enviado') : (l.resendEmail ?? 'Reenviar e-mail')}
        </button>
        <button onClick={() => signOut()} style={{ background: 'none', border: 'none', fontSize: 13, color: 'var(--arvo-fg-soft)', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)' }}>
          {t.nav.signout}
        </button>
      </div>
    </div>
  )
}


function ProtectedRoutes() {
  const { user, loading } = useAuth()

  if (loading) return <ArvoSplash />

  if (!user) return <Navigate to="/" replace />

  if (!user.email_confirmed_at) return <EmailConfirmGate email={user.email ?? ''} />

  return <UpgradeProvider><AchievementProvider><NotificationsProvider><MessagingProvider><AppLayout /></MessagingProvider></NotificationsProvider></AchievementProvider></UpgradeProvider>
}

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) return <ArvoSplash />

  return (
    <Routes>
      <Route path="/login"   element={user ? <Navigate to={sessionStorage.getItem('pending_invite_token') ? `/invite/${sessionStorage.getItem('pending_invite_token')}` : sessionStorage.getItem('pending_resource_slug') ? `/resources/${sessionStorage.getItem('pending_resource_slug')}` : sessionStorage.getItem('pending_trip_gate') ? `/voyage/shared/${sessionStorage.getItem('pending_trip_gate')}` : (user.user_metadata?.default_section === 'finances' ? '/finances' : user.user_metadata?.default_section === 'voyage' ? '/voyage' : user.user_metadata?.default_section === 'investments' ? '/dashboard' : '/home')} replace /> : <LoginPage />} />
      <Route path="/"        element={user ? <Navigate to={user.user_metadata?.default_section === 'finances' ? '/finances' : user.user_metadata?.default_section === 'voyage' ? '/voyage' : user.user_metadata?.default_section === 'investments' ? '/dashboard' : '/home'} replace /> : <LandingPage />} />
      <Route path="/privacy"                element={<PrivacyPolicyPage />} />
      <Route path="/terms"                  element={<TermsOfUsePage />} />
      <Route path="/share/momento/:token"   element={<PublicMomentPage />} />
      <Route path="/share/portfolio/:token"  element={<PublicPortfolioPage />} />
      <Route path="/invite/:token"           element={<AcceptInvitePage />} />
      <Route path="/voyage/invite/:token"    element={<AcceptTripInvitePage />} />
      <Route path="/finances/moments/invite/:token" element={<AcceptMomentInvitePage />} />
      <Route path="/trip/:token"             element={<PublicTripPage />} />
      {/* /resources/:slug: só uma das duas existe por vez, dependendo de `user` —
          gate de cadastro (fora do app) pra quem não tem sessão, ou a página de
          detalhe dentro do AppLayout (com header/nav normais) pra quem já está
          logado. Não dá pra ter as duas registradas ao mesmo tempo com o mesmo
          path (React Router não permite path duplicado), então a troca acontece
          aqui, condicionada ao próprio estado de auth já disponível neste componente. */}
      {!user && <Route path="/resources/:slug" element={<ResourcePublicPage />} />}
      {/* Mesmo mecanismo pro lead magnet de viagem: deslogado vê o gate de
          cadastro, logado vê o roteiro dentro do AppLayout (rota nas rotas
          protegidas de /voyage, abaixo). */}
      {!user && <Route path="/voyage/shared/:tripId" element={<SharedTripGatePage />} />}
      <Route element={<ProtectedRoutes />}>
        {/* Patrimônio (gate 'patrimonio', Plus) — a seção inteira exceto
            instituições/contas, que são compartilhadas com Finanças e ficam
            fora do gate. Reports (IR França) tem gate próprio 'ir_france' (Pro). */}
        <Route path="/dashboard"      element={<GateGuard gate="patrimonio"><DashboardPage /></GateGuard>} />
        <Route path="/assets"         element={<GateGuard gate="patrimonio"><AssetsPage /></GateGuard>} />
        <Route path="/performance"    element={<GateGuard gate="patrimonio"><PerformancePage /></GateGuard>} />
        <Route path="/assets/:id"     element={<GateGuard gate="patrimonio"><AssetDetailPage /></GateGuard>} />
        <Route path="/profile"        element={<ProfilePage />} />
        <Route path="/institutions"          element={<InstitutionPage />} />
        <Route path="/institutions/profiles" element={<InstitutionsPage />} />
        <Route path="/import/b3"      element={<ImportB3Page />} />
        <Route path="/portfolio"      element={<PortfolioLayout />}>
          <Route index                element={<GateGuard gate="patrimonio"><ContributionsPage /></GateGuard>} />
          <Route path="rebalance"     element={<GateGuard gate="patrimonio"><RebalancePage /></GateGuard>} />
          <Route path="institutions"  element={<Navigate to="/institutions" replace />} />
          <Route path="classes"       element={<GateGuard gate="patrimonio"><ClassesPage /></GateGuard>} />
          <Route path="reports"       element={<GateGuard gate="ir_france" requiredTier="pro"><ReportsPage /></GateGuard>} />
          <Route path="indices"       element={<IndicesPage />} />
          <Route path="indices/:code" element={<IndexDetailPage />} />
        </Route>
        <Route path="/dividends"      element={<GateGuard gate="patrimonio"><DividendsPage /></GateGuard>} />
        <Route path="/favorites"      element={<Navigate to="/assets?view=favorites" replace />} />
        <Route path="/achievements"   element={<AchievementsPage />} />
        <Route path="/notifications"  element={<NotificationsPage />} />
        <Route path="/home"           element={<HomePage />} />
        <Route path="/people"         element={<PeoplePage />} />
        <Route path="/admin"           element={<AdminPage />} />
        <Route path="/planos"          element={<PlansPage />} />
        <Route path="/resources"       element={<ResourcesPage />} />
        <Route path="/resources/admin" element={<Navigate to="/admin?tab=resources" replace />} />
        <Route path="/resources/:slug" element={<ResourceDetailPage />} />
        <Route path="/messages"       element={<GateGuard gate="messaging"><MessagesPage /></GateGuard>} />
        <Route path="/messages/:conversationId" element={<GateGuard gate="messaging"><ConversationPage /></GateGuard>} />
        <Route path="/archived"       element={<Navigate to="/assets?view=archived" replace />} />
        <Route path="/diversification" element={<GateGuard gate="diversification" requiredTier="pro"><DiversificationPage /></GateGuard>} />
        <Route path="/voyage"          element={<VoyageLayout />}>
          <Route index                element={<VoyageTripsPage />} />
          <Route path="shared/:tripId" element={<SharedTripViewPage />} />
          <Route path=":id"           element={<VoyageTripDetailPage />} />
          <Route path="places"        element={<VoyagePlacesPage />} />
          <Route path="map"           element={<VoyageMapPage />} />
        </Route>
        <Route path="/community"       element={<GateGuard gate="community"><CommunityLayout /></GateGuard>}>
          <Route index                element={<CommunityHomePage />} />
          <Route path="admin"         element={<Navigate to="/admin" replace />} />
          {/* "trips" antes de :slug — o segmento estático ganha da categoria dinâmica */}
          <Route path="trips"         element={<CommunityTripsPage />} />
          <Route path=":slug"         element={<CommunityCategoryPage />} />
          <Route path=":slug/:topicId" element={<CommunityTopicPage />} />
        </Route>
        {/* Perfil público de usuário — diferente de /profile (configurações próprias) */}
        <Route path="/u/:username"    element={<UserProfilePage />} />
        <Route path="/finances"       element={<FinancesLayout />}>
          <Route index                element={<FinancesOverviewPage />} />
          <Route path="transactions"  element={<FinancesTransactionsPage />} />
          <Route path="budget"        element={<GateGuard gate="budget"><FinancesBudgetPage /></GateGuard>} />
          <Route path="moments"       element={<FinancesMomentsPage />} />
          <Route path="moments/:id"   element={<MomentDetailPage />} />
          <Route path="freedom"       element={<GateGuard gate="freedom_plans"><FinancesFreedomPage /></GateGuard>} />
          {/* Grupo criação/edição/membros migrou pra Amigos; categorias compartilhadas
              se editam direto no Planejamento (botão "Compartilhar" na categoria). */}
          <Route path="shared"         element={<Navigate to="/people" replace />} />
          <Route path="insights"      element={<GateGuard gate="insights" requiredTier="pro"><FinancesInsightsPage /></GateGuard>} />
          <Route path="subscriptions" element={<Navigate to="/finances/insights" replace />} />
          <Route path="fees"          element={<Navigate to="/finances/insights" replace />} />
          <Route path="accounts"      element={<AccountsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    // Boundary global fora dos providers: pega crash de qualquer provider/rota.
    // O fallback não usa nenhum contexto (ver ErrorBoundary.tsx).
    <ErrorBoundary variant="global">
      <BrowserRouter>
        <AuthProvider>
          <I18nProvider>
            <CurrencyProvider>
              <ThemeProvider>
                <AppRoutes />
              </ThemeProvider>
            </CurrencyProvider>
          </I18nProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
