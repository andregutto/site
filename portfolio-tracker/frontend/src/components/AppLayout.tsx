import { useState, useEffect, useRef, cloneElement } from 'react'
import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useCurrency, type Currency } from '../contexts/CurrencyContext'
import { useTheme } from '../contexts/ThemeContext'
import { useI18n } from '../contexts/I18nContext'
import type React from 'react'
import { useNotificationsContext } from '../contexts/NotificationsContext'
import { useMessagingContext } from '../contexts/MessagingContext'
import { useUpgrade } from '../contexts/UpgradeContext'
import { TierGlyph, ArvoGlyphSolid } from './upgrade/TierBadge'
import { resolveNotificationText, SEVERITY_COLORS, formatTimestamp } from '../lib/notifications'
import { apiFetch } from '../lib/api'
import LoginFooter from './LoginFooter'
import { RouteErrorBoundary } from './ErrorBoundary'
import OnboardingOverlay from './OnboardingOverlay'
import LanguageSelector from './LanguageSelector'
import ChatWidget from './ChatWidget'
import SetupChecklist from './SetupChecklist'
import { Icon, type IconName } from './icons'
import { Banner } from './ui'
import { prefetchActiveFriends } from '../hooks/useActiveFriends'

const onboardingKey = (userId: string) => `onboarding_v1_done_${userId}`
const CURRENCIES: Currency[] = ['BRL', 'USD', 'EUR']
const NOTIF_ACCEPTABLE_TYPES = new Set(['trip_invite', 'moment_invite', 'shared_group_invite', 'friend_invite'])

const NOTIF_ICON: Record<string, IconName> = {
  achievement: 'seal',
  bank_connected: 'bank',
  bank_connect_error: 'alert',
  split_warning: 'scissors',
  budget_alert: 'coin',
  shared_category_alert: 'share',
  home_prompt: 'home',
  budget_reminder_setup: 'clock',
  budget_reminder_due: 'clock',
  subscription_detected: 'repeat',
  shared_group_invite: 'share',
  trip_invite: 'share',
  friend_invite: 'users',
  friend_accepted: 'users',
  friend_invite_accepted: 'users',
  community_reply: 'share',
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, cb: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) cb()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ref, cb, active])
}

export default function AppLayout() {
  const { user, signOut } = useAuth()
  const { currency, setCurrency, hideValues, toggleHideValues } = useCurrency()
  const { resolvedTheme, setTheme } = useTheme()
  const { t, locale } = useI18n()
  const { active: activeNotifications, unreadCount, dismissAll, acceptInvite } = useNotificationsContext()
  const { unreadTotal: messagesUnreadTotal } = useMessagingContext()
  const { hasGate, entitlements } = useUpgrade()
  // Tier do usuário no header (glifo ao lado do logo). Beta lê como Pro
  // visualmente por ora; Free não ganha glifo extra.
  const headerTier: 'plus' | 'pro' | null =
    entitlements?.tier === 'pro' || entitlements?.tier === 'beta' ? 'pro'
      : entitlements?.tier === 'plus' ? 'plus'
      : null
  // Pill de upgrade fixo no topo direito (padrão Finary), SÓ pro free e SÓ no
  // desktop. Quem paga comprou também o silêncio (decisão 2026-07-09): o Plus
  // não vê upsell permanente; o convite pro Pro acontece contextualmente nos
  // gates Pro (Insights/Diversification/IR) e na /planos.
  const upsellTier: 'plus' | null = entitlements?.tier === 'free' ? 'plus' : null
  // Alterna direto light↔dark (sem passar por 'auto') — o ícone reflete o
  // estado atual: sol no dark (clica → light), lua no light (clica → dark).
  const toggleTheme = () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  const [acceptingKey, setAcceptingKey] = useState<string | null>(null)
  const location = useLocation()

  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showUserMenu,   setShowUserMenu]   = useState(false)
  const [showNotifMenu,  setShowNotifMenu]  = useState(false)
  const subNavScrollRef = useRef<HTMLDivElement>(null)
  const [navCollapsed,  setNavCollapsed]  = useState(false)
  const navigate = useNavigate()
  // Drag-to-select na pill nav mobile (efeito "liquid glass" tipo iOS Control
  // Center): pressiona um item e arrasta o dedo pelos outros. Ao contrário da
  // v1 (que só trocava o fundo de um item pro outro instantaneamente, sem
  // nenhuma sensação de "líquido"), a bolha de destaque agora segue a posição
  // exata do dedo em tempo real (sem transição, 1:1) e só ganha uma animação
  // com leve overshoot ("mola") quando solta — é essa combinação (rígido
  // durante o arrasto, elástico ao soltar) que lembra o material de vidro
  // líquido da Apple, em vez de um highlight que simplesmente pula de item
  // em item. Um toque simples (sem arrastar) continua funcionando
  // normalmente via o onClick nativo do NavLink.
  const [dragHighlightIndex, setDragHighlightIndex] = useState<number | null>(null)
  const [liquidX, setLiquidX] = useState<number | null>(null) // posição da bolha, relativa ao container da nav
  const [liquidSettling, setLiquidSettling] = useState(false) // true só durante a animação de encaixe ao soltar
  const dragStartIndexRef = useRef<number | null>(null)
  const navItemRefs = useRef<(HTMLElement | null)[]>([])
  const navRowRef = useRef<HTMLDivElement>(null)

  function indexAtPoint(clientX: number, clientY: number): number | null {
    for (let i = 0; i < navItemRefs.current.length; i++) {
      const el = navItemRefs.current[i]
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) return i
    }
    return null
  }

  function itemCenterX(index: number): number | null {
    const el = navItemRefs.current[index]
    const containerEl = navRowRef.current
    if (!el || !containerEl) return null
    const r = el.getBoundingClientRect()
    const containerRect = containerEl.getBoundingClientRect()
    return (r.left - containerRect.left) + r.width / 2
  }
  const [chatVisible,    setChatVisible]    = useState(() => localStorage.getItem('arvo_chat_visible') !== 'false')
  const [openChatNow,    setOpenChatNow]    = useState(false)

  function openChat() {
    setChatVisible(true)
    localStorage.setItem('arvo_chat_visible', 'true')
    setOpenChatNow(true)
    setShowUserMenu(false)
  }
  function dismissChat() {
    setChatVisible(false)
    localStorage.setItem('arvo_chat_visible', 'false')
  }

  const userMenuRef = useRef<HTMLDivElement>(null)
  useClickOutside(userMenuRef, () => setShowUserMenu(false), showUserMenu)

  const notifMenuRef = useRef<HTMLDivElement>(null)
  useClickOutside(notifMenuRef, () => setShowNotifMenu(false), showNotifMenu)

  useEffect(() => {
    setShowUserMenu(false)
    setShowNotifMenu(false)
  }, [location.pathname])

  useEffect(() => { prefetchActiveFriends() }, [])

  // Auto-scroll active sub-nav tab into center view (Option B)
  useEffect(() => {
    const container = subNavScrollRef.current
    if (!container) return
    const active = container.querySelector('[aria-current="page"]') as HTMLElement | null
    if (!active) return
    container.scrollTo({
      left: active.offsetLeft - container.offsetWidth / 2 + active.offsetWidth / 2,
      behavior: 'smooth',
    })
  }, [location.pathname])

  // Mobile bottom nav: shrink + hide sub-nav while the user scrolls down
  // (focus on content), restore to full size as soon as they scroll back up.
  // Near the top, always stay expanded regardless of direction.
  useEffect(() => {
    let lastY = window.scrollY
    function handleScroll() {
      const y = window.scrollY
      const delta = y - lastY
      if (y < 24) setNavCollapsed(false)
      else if (delta > 4) setNavCollapsed(true)
      else if (delta < -4) setNavCollapsed(false)
      lastY = y
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (!user?.id) return
    if (localStorage.getItem(onboardingKey(user.id))) return
    apiFetch<{ id: number }[]>('/assets')
      .then(assets => { if (assets.length === 0) setShowOnboarding(true) })
      .catch(() => {})
  }, [user?.id])

  const [showBudgetBanner, setShowBudgetBanner] = useState(false)
  const [showBudgetSetup, setShowBudgetSetup] = useState(false)
  useEffect(() => {
    if (!user?.id) return
    const freq = Number(user.user_metadata?.budget_reminder_freq ?? 0)
    if (freq === 0) {
      // Prompt de "quer ser lembrado de revisar seu planejamento?" — não pode
      // aparecer pra qualquer recém-criado embaixo do subnav (overwhelming).
      // Só faz sentido pra quem PODE ter orçamento (gate `budget`) e já está
      // engajado: tem categorias com orçamento OU a conta tem ≥7 dias. Nunca na
      // mesma sessão em que o onboarding foi mostrado (`showOnboarding`) nem se
      // acabou de terminar o onboarding.
      if (!hasGate('budget')) { setShowBudgetSetup(false); return }
      if (showOnboarding) { setShowBudgetSetup(false); return }
      if (localStorage.getItem('arvo_onboarding_just_finished') === '1') { setShowBudgetSetup(false); return }
      const dismissed = localStorage.getItem(`arvo_budget_reminder_setup_dismissed_${user.id}`)
      if (dismissed) { setShowBudgetSetup(false); return }

      const createdAt = user.created_at ? new Date(user.created_at).getTime() : Date.now()
      const accountOldEnough = Date.now() - createdAt >= 7 * 24 * 60 * 60 * 1000

      // Tem planejamento? (categorias com orçamento definido, exceto salário)
      apiFetch<Array<{ budget_monthly?: number; name_key?: string }>>('/finances/categories')
        .then(cats => {
          const hasPlanning = (cats ?? []).some(c => c.name_key !== 'categorySalary' && (c.budget_monthly ?? 0) > 0)
          setShowBudgetSetup(hasPlanning || accountOldEnough)
        })
        .catch(() => setShowBudgetSetup(accountOldEnough))
      return
    }
    const last = localStorage.getItem(`arvo_budget_reminder_last_${user.id}`)
    if (!last) {
      const today = new Date().toISOString().split('T')[0]
      localStorage.setItem(`arvo_budget_reminder_last_${user.id}`, today)
      return
    }
    const diffMs = Date.now() - new Date(last).getTime()
    const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30.44)
    if (diffMonths >= freq) setShowBudgetBanner(true)
  }, [user?.id, user?.created_at, user?.user_metadata?.budget_reminder_freq, hasGate, showOnboarding])

  function dismissBudgetBanner() {
    if (user?.id) {
      const today = new Date().toISOString().split('T')[0]
      localStorage.setItem(`arvo_budget_reminder_last_${user.id}`, today)
    }
    setShowBudgetBanner(false)
  }

  function dismissBudgetSetup() {
    if (user?.id) localStorage.setItem(`arvo_budget_reminder_setup_dismissed_${user.id}`, '1')
    setShowBudgetSetup(false)
  }

  const meta = user?.user_metadata ?? {}
  const headerLabel = [meta.first_name, meta.last_name].filter(Boolean).join(' ') || user?.email || ''
  const avatarUrl = meta.avatar_url as string | undefined
  const avatarInitials = headerLabel.slice(0, 2).toUpperCase()

  const [username, setUsername] = useState<string>('')
  useEffect(() => {
    if (!user?.id) { setUsername(''); return }
    apiFetch<{ username?: string }>('/profile').then(d => setUsername(d.username ?? '')).catch(() => {})
  }, [user?.id])

  // Um flag só (community_admins) libera as duas abas do painel consolidado
  // em /admin (Comunidade e Recursos) — ver GET /community/is-admin.
  // Cacheado em localStorage por usuário: evita o "salto" do item Admin
  // aparecendo no menu um instante depois de aberto, em visitas seguintes.
  const isAdminCacheKey = user?.id ? `arvo_is_admin_${user.id}` : null
  const [isAdmin, setIsAdmin] = useState(() => isAdminCacheKey ? localStorage.getItem(isAdminCacheKey) === '1' : false)
  useEffect(() => {
    if (!user?.id) { setIsAdmin(false); return }
    const key = `arvo_is_admin_${user.id}`
    setIsAdmin(localStorage.getItem(key) === '1')
    apiFetch<{ is_admin: boolean }>('/community/is-admin').then(d => {
      setIsAdmin(d.is_admin)
      localStorage.setItem(key, d.is_admin ? '1' : '0')
    }).catch(() => {})
  }, [user?.id])

  const inInvestimentos = location.pathname === '/dashboard' || location.pathname === '/' ||
    location.pathname.startsWith('/assets') ||
    location.pathname.startsWith('/performance') ||
    location.pathname.startsWith('/dividends') ||
    location.pathname.startsWith('/portfolio') ||
    location.pathname.startsWith('/diversification') ||
    location.pathname.startsWith('/institutions')
  const inFinances = location.pathname.startsWith('/finances')
  const inVoyage = location.pathname.startsWith('/voyage')
  const inCommunity = location.pathname.startsWith('/community')
  const inResources = location.pathname.startsWith('/resources')
  // Aprender agrupa Comunidade + Recursos num item de nav só — Recursos ainda
  // não tem volume pra justificar uma vertente própria (só volta a ser
  // separado quando Aprendizado/lives entrar em cena).
  const inAprender = inCommunity || inResources

  const sectionAccent = inInvestimentos ? '#1B4FD8' : inFinances ? '#A36A52' : inVoyage ? '#D63B2F' : inAprender ? '#E8A020' : '#1F8A5B'

  const investimentosItems = [
    { to: '/dashboard', label: t.nav.dashboard, end: true, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <rect x="1" y="9" width="3" height="6" rx=".5"/><rect x="6.5" y="5.5" width="3" height="9.5" rx=".5"/><rect x="12" y="2" width="3" height="13" rx=".5"/>
      </svg>
    )},
    { to: '/performance', label: t.nav.performance, end: false, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M1 12l4-4 3 3 7-7M11.5 4H15v3.5"/>
      </svg>
    )},
    { to: '/diversification', label: t.nav.diversification, end: false, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <circle cx="8" cy="8" r="6.5"/>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 1.5v13M1.5 8h13M3.2 3.2l9.6 9.6M12.8 3.2L3.2 12.8"/>
      </svg>
    )},
    { to: '/assets', label: t.nav.assets, end: true, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <rect x="1" y="1.5" width="14" height="3" rx=".5"/><rect x="1" y="6.5" width="14" height="3" rx=".5"/><rect x="1" y="11.5" width="14" height="3" rx=".5"/>
      </svg>
    )},
    { to: '/portfolio', label: t.nav.contributions, end: true, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 1v14M1 8h14"/>
      </svg>
    )},
    { to: '/institutions', label: t.nav.institutions, end: false, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2 14V6l6-4.5L14 6v8H2zM6 14V9h4v5"/>
      </svg>
    )},
    { to: '/dividends', label: t.nav.dividends, end: true, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <circle cx="8" cy="8" r="6.5"/><path strokeLinecap="round" strokeLinejoin="round" d="M8 5v6M6 7h3a1 1 0 010 2H6"/>
      </svg>
    )},
    { to: '/portfolio/rebalance', label: t.nav.rebalance, end: false, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 2v12M4 14h8M4 6l-3 4h6L4 6zM12 4l-3 4h6l-3-4z"/>
      </svg>
    )},
    { to: '/portfolio/indices', label: t.nav.indices, end: false, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M1 12l4-4 3 3 7-7M11.5 4H15v3.5"/>
      </svg>
    )},
    { to: '/portfolio/reports', label: t.nav.ir, end: false, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 1.5h6.5L13 5v9.5H3zM9 1.5V5h4M5 8h6M5 11h4"/>
      </svg>
    )},
  ]

  const financesItems = [
    { to: '/finances', label: t.finances.navOverview, end: true, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 7.5L8 2l6.5 5.5V14.5H10V10H6v4.5H1.5z"/>
      </svg>
    )},
    { to: '/finances/transactions', label: t.finances.navTransactions, end: false, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <rect x="1" y="3" width="14" height="10" rx="1.5"/><path strokeLinecap="round" d="M1 6.5h14M4 10h2M9 10h3"/>
      </svg>
    )},
    { to: '/finances/budget', label: t.finances.navBudget, end: false, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <circle cx="8" cy="8" r="6.5"/><circle cx="8" cy="8" r="3"/>
        <circle cx="8" cy="8" r=".75" fill="currentColor" stroke="none"/>
      </svg>
    )},
    { to: '/finances/moments', label: t.finances.navMoments, end: false, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <circle cx="8" cy="8" r="2.5"/>
        <path strokeLinecap="round" d="M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/>
      </svg>
    )},
    // Contas é a visão de Finanças (só contas por instituição + criar conta,
    // sem dados de portfólio — acessível a todos os tiers). A visão completa
    // de Instituições, com ativos, segue no Patrimônio (gated).
    { to: '/finances/accounts', label: t.finances.accountsPageTitle, end: false, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2 14V6l6-4.5L14 6v8H2zM6 14V9h4v5"/>
      </svg>
    )},
    { to: '/finances/freedom', label: t.finances.navFreedom, end: false, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M1 12.5a7 7 0 0114 0"/>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 9V5M5.5 6.5L8 5l2.5 1.5"/>
      </svg>
    )},
    { to: '/finances/insights', label: t.finances.navInsights, end: false, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.542 10.603 6 12.5l-.542-1.897a3 3 0 0 0-2.06-2.06L1.5 8l1.897-.542a3 3 0 0 0 2.06-2.06L6 3.5l.542 1.897a3 3 0 0 0 2.06 2.06L10.5 8l-1.897.542a3 3 0 0 0-2.06 2.06ZM12.173 5.81 12 6.5l-.173-.69a2.25 2.25 0 0 0-1.637-1.637L9.5 4l.691-.173a2.25 2.25 0 0 0 1.637-1.637L12 1.5l.173.69a2.25 2.25 0 0 0 1.637 1.637L15.5 4l-.69.173a2.25 2.25 0 0 0-1.637 1.637Z"/>
      </svg>
    )},
  ]

  const voyageItems = [
    { to: '/voyage', label: (t as any).voyage?.navTrips ?? 'Viagens', end: true, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M1 11.5l3-7 4 3 3-5 4 3"/>
        <path strokeLinecap="round" d="M1 14.5h14"/>
      </svg>
    )},
    { to: '/voyage/places', label: (t as any).voyage?.navPlaces ?? 'Lugares', end: false, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 1.5C5.515 1.5 3.5 3.515 3.5 6c0 3.375 4.5 8.5 4.5 8.5S12.5 9.375 12.5 6c0-2.485-2.015-4.5-4.5-4.5Z"/>
        <circle cx="8" cy="6" r="1.5"/>
      </svg>
    )},
    { to: '/voyage/map', label: (t as any).voyage?.navMap ?? 'Mapa', end: false, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M1 3l4.5 1.5L10.5 3 15 4.5v9L10.5 12 5.5 13.5 1 12V3ZM5.5 3v10.5M10.5 3V12"/>
      </svg>
    )},
  ]

  // Sub-nav de Aprender: só um toggle Comunidade/Recursos (cada um mantém sua
  // própria navegação interna — categorias, tópicos, admin — dentro da
  // própria página; aqui é só a troca entre as duas seções).
  const aprenderItems = [
    { to: '/community', label: (t as any).nav?.community ?? 'Comunidade', end: false, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <circle cx="6" cy="5.5" r="2"/><circle cx="11.5" cy="6" r="1.6"/>
        <path strokeLinecap="round" d="M2 13c0-1.9 1.6-3.4 4-3.4s4 1.5 4 3.4M10.5 8.6c1.9 0 3.5 1.2 3.5 3"/>
      </svg>
    )},
    { to: '/resources', label: (t as any).nav?.resources ?? 'Recursos', end: false, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 1.5h6.5L13 5v9.5H3zM9 1.5V5h4"/>
        <path strokeLinecap="round" d="M8 7.5v4M6 9.7l2 1.8 2-1.8"/>
      </svg>
    )},
  ]

  // Categorias fixas da V1 (mesmo seed da migration 053_community.sql) — sem
  // busca assíncrona no header, é uma lista pequena e estável.
  const activeSubItems = inInvestimentos ? investimentosItems : inFinances ? financesItems : inVoyage ? voyageItems : inAprender ? aprenderItems : []

  const navItems = [
    { to: '/dashboard', label: t.nav.investments, match: inInvestimentos, icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.5l7.5-7.5 4 4L21 4.5M3 20.5h18" />
      </svg>
    )},
    { to: '/finances', label: t.nav.finances, match: inFinances, icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <circle cx="12" cy="12" r="9.75" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75v10.5M15 9.3c-.6-1.05-1.65-1.65-3-1.65-1.8 0-3.15 1.05-3.15 2.55S10.2 12.3 12 12.6s3.3 1.05 3.3 2.55-1.35 2.55-3.3 2.55c-1.35 0-2.55-.6-3.15-1.65" />
      </svg>
    )},
    { to: '/voyage', label: (t as any).nav?.voyage ?? 'Viagens', match: inVoyage, icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 2C8.134 2 5 5.134 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.866-3.134-7-7-7Z"/>
        <circle cx="12" cy="9" r="2.5"/>
      </svg>
    )},
    { to: '/community', label: (t as any).nav?.aprender ?? 'Aprender', match: inAprender, icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <circle cx="9" cy="8" r="3"/>
        <circle cx="17" cy="9" r="2.4"/>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 19.5v-1a5.5 5.5 0 0 1 11 0v1"/>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 13.2a4.3 4.3 0 0 1 5 4.2v1.1"/>
      </svg>
    )},
  ]

  return (
    <div className={`min-h-screen flex flex-col${resolvedTheme === 'dark' ? ' dark' : ''}`} style={{ background: 'var(--arvo-bg)' }}>
      <header className="sticky top-0 z-10" style={{ background: 'var(--arvo-header-bg)', backdropFilter: 'blur(12px) saturate(1.05)', WebkitBackdropFilter: 'blur(12px) saturate(1.05)', borderBottom: '1px solid var(--arvo-border-soft)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>

        {/* ── Main bar ── */}
        <div className="h-14 flex items-center px-6 gap-4">

          {/* Logo como lockup do plano (variante C aprovada 2026-07-09): com
              Plus/Pro, o glifo do PRÓPRIO logo ganha o degradê do tier e o nome
              do plano entra na linha, na mesma Tenor Sans e mesmo tracking do
              wordmark, menor e dourado. Free = logo puro. Sem glifo duplicado.
              Mobile mostra glifo tingido + nome do plano (wordmark some). */}
          <Link
            to="/home"
            className="shrink-0 flex items-center gap-2.5 hover:opacity-70 transition-opacity"
            style={{ textDecoration: 'none' }}
            title={headerTier ? (headerTier === 'pro' ? 'Arvo Pro' : 'Arvo Plus') : undefined}
          >
            {headerTier ? (
              <TierGlyph tier={headerTier} size={22} onDark={resolvedTheme === 'dark'} style={{ display: 'block' }} />
            ) : (
              <ArvoGlyphSolid size={22} onDark={resolvedTheme === 'dark'} style={{ display: 'block' }} />
            )}
            {/* Wordmark + plano alinhados pela BASELINE (items-center deixava o
                'pro' flutuando); o espaçamento entre eles vem do tracking final
                do wordmark, sem textIndent no rótulo do plano. */}
            {/* Wordmark some no mobile, mas o rótulo do plano FICA (pedido do
                André 2026-07-09): glifo tingido + "pro"/"plus" é o lockup
                compacto. Baseline compartilhada nos dois casos. */}
            <span className="inline-flex" style={{ alignItems: 'baseline' }}>
              <span className="hidden sm:inline" style={{ fontFamily: "var(--arvo-font-display)", fontSize: 16, letterSpacing: '0.30em', textIndent: '0.30em', color: 'var(--arvo-fg)', lineHeight: 1 }}>arvo</span>
              {headerTier && (
                <span style={{ fontFamily: "var(--arvo-font-display)", fontSize: 12, letterSpacing: '0.24em', color: resolvedTheme === 'dark' ? 'var(--arvo-gold)' : 'var(--arvo-gold-text)', lineHeight: 1 }}>
                  {headerTier === 'pro' ? 'pro' : 'plus'}
                </span>
              )}
            </span>
          </Link>
          <div className="hidden sm:flex" style={{ alignItems: 'center', gap: 12, paddingLeft: 14, borderLeft: '1px solid var(--arvo-border)', height: 24 }}>
            <span style={{ fontFamily: "var(--arvo-font-display)", fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: inVoyage ? '#D63B2F' : inAprender ? '#E8A020' : 'var(--arvo-fg-soft)', lineHeight: 1, transition: 'color 280ms' }}>
              {inVoyage ? 'Voyage' : inAprender ? 'Aprender' : 'Capital'}
            </span>
          </div>

          {/* Desktop — section tabs (pill style) */}
          <nav className="hidden sm:flex flex-1 justify-center gap-1">
            {([
              { to: '/dashboard',    label: t.nav.investments,                         active: inInvestimentos },
              { to: '/finances',     label: t.nav.finances,                            active: inFinances },
              { to: '/voyage',       label: (t as any).nav?.voyage ?? 'Viagens',       active: inVoyage },
              { to: '/community',    label: (t as any).nav?.aprender ?? 'Aprender',    active: inAprender },
            ] as Array<{ to: string; label: string; active: boolean }>).map(({ to, label, active }) => (
              <NavLink
                key={to} to={to}
                className={() => `px-4 py-1.5 rounded-full text-xs whitespace-nowrap transition-all`}
                style={{ fontFamily: "var(--arvo-font-body)", letterSpacing: '0.16em', textTransform: 'uppercase',
                  background: active ? 'var(--arvo-pill-active-bg)' : 'transparent',
                  color: active ? 'var(--arvo-pill-active-fg)' : 'var(--arvo-fg-muted)',
                  transition: 'all 280ms cubic-bezier(0.22,0.61,0.36,1)' }}
              >{label}</NavLink>
            ))}
          </nav>

          {/* Right — user */}
          <div className="flex items-center gap-3 shrink-0 ml-auto">
            {/* Eye: hide/show all values — só faz sentido em Capital/Finanças, onde
                há valores monetários na tela. Em qualquer outra seção (Voyage,
                Comunidade, Mensagens, Pessoas, Perfil, Notificações...) é um ícone
                a mais sem função, então mostra só onde realmente serve. */}
            {(inInvestimentos || inFinances || location.pathname.startsWith('/home')) && (
            <button
              onClick={toggleHideValues}
              title={hideValues ? (t.common.showValues ?? 'Mostrar valores') : (t.common.hideValues ?? 'Ocultar valores')}
              className="h-10 sm:h-8"
              style={{ padding: '0 8px', borderRadius: 8, border: hideValues ? '1px solid var(--arvo-border)' : '1px solid transparent', background: hideValues ? 'var(--arvo-hover-bg)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, transition: 'all 160ms ease', flexShrink: 0 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--arvo-hover-bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = hideValues ? 'var(--arvo-hover-bg)' : 'transparent')}
            >
              {hideValues ? (
                <svg className="w-[22px] h-[22px] sm:w-[18px] sm:h-[18px]" fill="none" viewBox="0 0 24 24" stroke="var(--arvo-fg-muted)" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                </svg>
              ) : (
                <svg className="w-[22px] h-[22px] sm:w-[18px] sm:h-[18px]" fill="none" viewBox="0 0 24 24" stroke="var(--arvo-fg-soft)" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </button>
            )}
            {upsellTier && (
              <Link
                to="/planos"
                className="shrink-0 hidden sm:inline-flex items-center"
                style={{
                  gap: 7, textDecoration: 'none', borderRadius: 999,
                  padding: '6px 13px 6px 9px',
                  background: resolvedTheme === 'dark' ? 'rgba(200,184,154,0.10)' : 'rgba(140,106,40,0.08)',
                  border: `1px solid ${resolvedTheme === 'dark' ? 'rgba(200,184,154,0.35)' : 'rgba(140,106,40,0.3)'}`,
                }}
                title="Conhecer o Arvo Plus"
              >
                <TierGlyph tier={upsellTier} size={13} onDark={resolvedTheme === 'dark'} style={{ display: 'block' }} />
                <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: resolvedTheme === 'dark' ? 'var(--arvo-gold)' : 'var(--arvo-gold-text)' }}>
                  {(t as any).upgrade?.headerPill?.replace('{tier}', 'Plus') ?? 'Conhecer o Plus'}
                </span>
              </Link>
            )}
            {/* Theme toggle — ghost icon no header, desktop E mobile (decisão
                2026-07-09: o André preferiu o ícone sempre visível ao controle
                no menu do avatar). Sol no dark (→ light), lua no light (→ dark). */}
            <button
              onClick={toggleTheme}
              title={resolvedTheme === 'dark' ? ((t.common as any).themeToggleLight ?? 'Tema claro') : ((t.common as any).themeToggleDark ?? 'Tema escuro')}
              aria-label={resolvedTheme === 'dark' ? ((t.common as any).themeToggleLight ?? 'Tema claro') : ((t.common as any).themeToggleDark ?? 'Tema escuro')}
              className="flex h-8 w-8"
              style={{ borderRadius: 8, alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0, transition: 'all 160ms ease', background: 'transparent', border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--arvo-hover-bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {resolvedTheme === 'dark' ? (
                // Sol
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="var(--arvo-fg-soft)" strokeWidth={1.8}>
                  <circle cx="12" cy="12" r="4" strokeLinecap="round" strokeLinejoin="round" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12H5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" />
                </svg>
              ) : (
                // Lua
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="var(--arvo-fg-soft)" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 13.5A8 8 0 0 1 10.5 4a7 7 0 1 0 9.5 9.5Z" />
                </svg>
              )}
            </button>
            {/* Balloon: messages — visível em qualquer tamanho de tela; escondê-lo só no
                mobile machucava a descoberta da feature (ficava enterrado no menu do
                avatar), então volta a aparecer no header em ambos. */}
            <Link
              to="/messages"
              title={(t as any).messages?.title ?? 'Mensagens'}
              className="flex h-10 w-10 sm:h-8 sm:w-8"
              style={{ borderRadius: 8, alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0, transition: 'all 160ms ease' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--arvo-hover-bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <svg className="w-[22px] h-[22px] sm:w-[18px] sm:h-[18px]" fill="none" viewBox="0 0 24 24" stroke="var(--arvo-fg-soft)" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
              </svg>
              {messagesUnreadTotal > 0 && (
                <span style={{ position: 'absolute', top: 2, right: 2, minWidth: 14, height: 14, padding: '0 3px', borderRadius: 999, background: 'var(--arvo-red)', color: 'white', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--arvo-font-body)', lineHeight: 1 }}>
                  {messagesUnreadTotal > 9 ? '9+' : messagesUnreadTotal}
                </span>
              )}
            </Link>
            {/* Bell: notifications */}
            <div ref={notifMenuRef} className="relative">
              <button
                onClick={() => setShowNotifMenu(v => !v)}
                title={t.notifications.title}
                className="h-10 w-10 sm:h-8 sm:w-8 flex"
                style={{ borderRadius: 8, alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0, transition: 'all 160ms ease' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--arvo-hover-bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <svg className="w-[22px] h-[22px] sm:w-[18px] sm:h-[18px]" fill="none" viewBox="0 0 24 24" stroke="var(--arvo-fg-soft)" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
                {unreadCount > 0 && (
                  <span style={{ position: 'absolute', top: 2, right: 2, minWidth: 14, height: 14, padding: '0 3px', borderRadius: 999, background: 'var(--arvo-red)', color: 'white', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--arvo-font-body)', lineHeight: 1 }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {showNotifMenu && (
                <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-32px)] rounded-xl shadow-lg z-50" style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border-soft)' }}>
                  <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--arvo-border-soft)' }}>
                    <span className="text-xs font-semibold" style={{ color: 'var(--arvo-fg)' }}>{t.notifications.activeSection}</span>
                    {activeNotifications.length > 0 && (
                      <button
                        onClick={() => dismissAll()}
                        className="text-[11px] font-medium transition-colors arvo-accent-blue"
                      >
                        {t.notifications.dismissAll}
                      </button>
                    )}
                  </div>
                  <div className="max-h-[60vh] overflow-y-auto py-1">
                    {activeNotifications.length === 0 ? (
                      <p className="px-4 py-6 text-center text-xs" style={{ color: 'var(--arvo-fg-soft)' }}>{t.notifications.emptyActive}</p>
                    ) : activeNotifications.map(item => {
                      const { title, subtitle } = resolveNotificationText(item, t, locale)
                      const color = SEVERITY_COLORS[item.severity] ?? SEVERITY_COLORS.info
                      const iconName = NOTIF_ICON[item.type] ?? 'bell'
                      const canAccept = NOTIF_ACCEPTABLE_TYPES.has(item.type) && !!item.params.token
                      const inner = (
                        <>
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}1A`, color }}><Icon name={iconName} size={15} /></div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium line-clamp-2" style={{ color: 'var(--arvo-fg)' }}>{title}</p>
                            <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--arvo-fg-soft)' }}>
                              {subtitle ? `${subtitle} · ` : ''}{formatTimestamp(item.occurred_at, locale)}
                            </p>
                          </div>
                          {canAccept && (
                            <button
                              onClick={async e => {
                                e.preventDefault()
                                e.stopPropagation()
                                setAcceptingKey(item.key)
                                try { await acceptInvite(item) } finally { setAcceptingKey(null) }
                              }}
                              disabled={acceptingKey === item.key}
                              className="shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-lg disabled:opacity-50"
                              style={{ background: 'var(--arvo-green)', color: '#fff' }}
                            >
                              {acceptingKey === item.key ? '…' : t.notifications.accept}
                            </button>
                          )}
                        </>
                      )
                      return item.link ? (
                        <Link key={item.key} to={item.link} onClick={() => setShowNotifMenu(false)} className="flex items-start gap-3 px-4 py-2.5 hover:bg-[var(--arvo-surface-2)] transition-colors">{inner}</Link>
                      ) : (
                        <div key={item.key} className="flex items-start gap-3 px-4 py-2.5">{inner}</div>
                      )
                    })}
                  </div>
                  <div className="p-2" style={{ borderTop: '1px solid var(--arvo-border-soft)' }}>
                    <Link
                      to="/notifications"
                      onClick={() => setShowNotifMenu(false)}
                      className="block text-center text-xs font-medium py-2 rounded-lg hover:bg-[var(--arvo-surface-2)] transition-colors arvo-accent-blue"
                    >
                      {t.notifications.viewAll}
                    </Link>
                  </div>
                </div>
              )}
            </div>
            {/* Na Hoje o checklist vira um card na própria página — evita duplicar */}
            {location.pathname !== '/home' && <SetupChecklist firstName={meta.first_name as string | undefined} userId={user?.id} />}
            <div ref={userMenuRef} className="relative">
              <button
                onClick={() => setShowUserMenu(v => !v)}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                title={headerLabel}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-7 h-7 rounded-full object-cover" style={{ outline: '1px solid var(--arvo-gold)', outlineOffset: 1 }} />
                ) : (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px]" style={{ background: 'var(--arvo-black)', color: 'var(--arvo-gold)', fontFamily: "var(--arvo-font-body)", letterSpacing: '0.08em', outline: '1px solid var(--arvo-gold)', outlineOffset: 1 }}>{avatarInitials}</div>
                )}
                <span className="hidden sm:inline text-xs max-w-[100px] truncate transition-colors" style={{ color: 'var(--arvo-fg-soft)' }}>{headerLabel}</span>
                <svg className={`w-3 h-3 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} style={{ color: 'var(--arvo-fg-faint)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showUserMenu && (
                <div className="absolute right-0 top-full mt-2 w-60 rounded-xl shadow-lg z-50 max-h-[85vh] overflow-y-auto" style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border-soft)' }}>
                  {/* Identity block */}
                  <Link to="/profile" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: '1px solid var(--arvo-border-soft)' }} onMouseEnter={e => (e.currentTarget.style.background='var(--arvo-hover-bg)')} onMouseLeave={e => (e.currentTarget.style.background='')}>
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-xs font-bold" style={{ background: 'var(--arvo-fg)', color: 'var(--arvo-pill-active-fg)' }}>{avatarInitials}</div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--arvo-fg)' }}>{headerLabel}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--arvo-fg-soft)' }}>{username ? `@${username}` : user?.email}</p>
                    </div>
                  </Link>

                  <div className="px-4 py-2 flex items-center justify-between" style={{ marginTop: 4 }}>
                    <span className="text-xs" style={{ color: 'var(--arvo-fg-soft)' }}>{t.common.language}</span>
                    <LanguageSelector />
                  </div>
                  <div className="px-4 py-2 flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--arvo-fg-soft)' }}>{t.currency?.label ?? 'Moeda'}</span>
                    <div className="flex items-center rounded-full p-0.5 gap-0.5" style={{ background: 'var(--arvo-chip-bg)' }}>
                      {CURRENCIES.map(c => (
                        <button key={c} onClick={() => setCurrency(c)}
                          className="px-2.5 py-1 text-xs rounded-full transition-all"
                          style={currency === c
                            ? { fontFamily: "var(--arvo-font-body)", background: 'var(--arvo-pill-active-bg)', color: 'var(--arvo-pill-active-fg)', letterSpacing: '0.06em' }
                            : { fontFamily: "var(--arvo-font-body)", color: 'var(--arvo-fg-soft)', letterSpacing: '0.06em' }}
                        >{c}</button>
                      ))}
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid var(--arvo-border-soft)', margin: '4px 0' }} />
                  <Link to="/achievements" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors" style={{ color: 'var(--arvo-fg-muted)' }} onMouseEnter={e => (e.currentTarget.style.background='var(--arvo-hover-bg)')} onMouseLeave={e => (e.currentTarget.style.background='')}>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 shrink-0">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 1.5l1.8 3.6 4 .6-2.9 2.8.7 4L8 10.4l-3.6 1.9.7-4L2.2 5.7l4-.6L8 1.5z"/>
                    </svg>
                    {t.nav.achievements}
                  </Link>
                  <Link to="/people" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors" style={{ color: 'var(--arvo-fg-muted)' }} onMouseEnter={e => (e.currentTarget.style.background='var(--arvo-hover-bg)')} onMouseLeave={e => (e.currentTarget.style.background='')}>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 shrink-0">
                      <circle cx="6" cy="5" r="2.5"/>
                      <path strokeLinecap="round" d="M1 13.5c0-2.8 2.2-5 5-5"/>
                      <circle cx="12" cy="6" r="2"/>
                      <path strokeLinecap="round" d="M16 14c0-2.2-1.8-4-4-4"/>
                    </svg>
                    {t.nav.people}
                  </Link>
                  {isAdmin && (
                    <Link to="/admin" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors" style={{ color: 'var(--arvo-fg-muted)' }} onMouseEnter={e => (e.currentTarget.style.background='var(--arvo-hover-bg)')} onMouseLeave={e => (e.currentTarget.style.background='')}>
                      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.43.992a6.759 6.759 0 010 .255c-.008.378.137.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {(t as any).nav?.admin ?? 'Administração'}
                    </Link>
                  )}

                  <div style={{ borderTop: '1px solid var(--arvo-border-soft)', margin: '4px 0' }} />
                  <Link to="/profile" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors" style={{ color: 'var(--arvo-fg-muted)' }} onMouseEnter={e => (e.currentTarget.style.background='var(--arvo-hover-bg)')} onMouseLeave={e => (e.currentTarget.style.background='')}>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 shrink-0">
                      <circle cx="8" cy="5" r="2.5"/><path strokeLinecap="round" d="M2.5 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/>
                    </svg>
                    {t.nav.profile}
                  </Link>
                  <button onClick={openChat} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors" style={{ color: 'var(--arvo-fg-muted)' }} onMouseEnter={e => (e.currentTarget.style.background='rgba(27,79,216,0.05)')} onMouseLeave={e => (e.currentTarget.style.background='')}>
                    <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0" fill="none">
                      <defs>
                        <linearGradient id="ai-sparkle-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#1B4FD8"/>
                          <stop offset="100%" stopColor="#E8A020"/>
                        </linearGradient>
                      </defs>
                      <path d="M8 1.5L9.3 6.7L14.5 8L9.3 9.3L8 14.5L6.7 9.3L1.5 8L6.7 6.7L8 1.5Z" fill="url(#ai-sparkle-grad)"/>
                      <circle cx="3" cy="3" r="1" fill="#1B4FD8" opacity="0.5"/>
                      <circle cx="13" cy="13" r="0.75" fill="#E8A020" opacity="0.5"/>
                    </svg>
                    <span className="flex-1 text-left">{t.chat.open}</span>
                    <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 999, background: 'linear-gradient(105deg, #1B4FD8, #E8A020)', color: 'white', letterSpacing: '0.07em', fontFamily: "var(--arvo-font-body)" }}>IA</span>
                  </button>

                  <button onClick={() => signOut()} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors" style={{ color: 'var(--arvo-red)', borderTop: '1px solid var(--arvo-border-soft)' }} onMouseEnter={e => (e.currentTarget.style.background='rgba(214,59,47,0.06)')} onMouseLeave={e => (e.currentTarget.style.background='')}>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 shrink-0">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 11.5L14 8l-3.5-3.5M14 8H6M6 2.5H3A1.5 1.5 0 0 0 1.5 4v8A1.5 1.5 0 0 0 3 13.5h3"/>
                    </svg>
                    {t.nav.signout}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Sub-nav bar — desktop: centered, sliding underline ── */}
        {activeSubItems.length > 0 && (
          <div className="hidden sm:block" style={{ borderTop: '1px solid var(--arvo-border-soft)', background: 'var(--arvo-subnav-bg)' }}>
            <div className="flex items-center justify-center gap-6 px-6">
              {activeSubItems.map(({ to, label, end }) => (
                <NavLink
                  key={to} to={to} end={end}
                  className="whitespace-nowrap transition-colors"
                  style={({ isActive }) => ({
                    fontFamily: "var(--arvo-font-body)", fontSize: 14, letterSpacing: '0.06em',
                    padding: '9px 1px', borderBottom: isActive ? `2px solid ${sectionAccent}` : '2px solid transparent',
                    color: isActive ? 'var(--arvo-fg)' : 'var(--arvo-fg-muted)', textDecoration: 'none',
                    transition: 'color 160ms ease, border-color 160ms ease',
                  })}
                >{label}</NavLink>
              ))}
            </div>
          </div>
        )}

      </header>

      {/* Banner queue (D9) — max one visible: budget setup takes priority over the recurring reminder */}
      {showBudgetSetup ? (
        <Banner
          onDismiss={dismissBudgetSetup}
          action={<NavLink to="/profile?tab=preferences" onClick={dismissBudgetSetup} className="arvo-btn arvo-btn--link shrink-0">{t.profile.budgetReminderSetupLink}</NavLink>}
        >
          {t.profile.budgetReminderSetupBody}
        </Banner>
      ) : showBudgetBanner ? (() => {
        const freq = user?.id ? parseInt(localStorage.getItem(`arvo_budget_reminder_freq_${user.id}`) ?? '0', 10) : 0
        const freqLabel = freq === 1 ? t.profile.budgetReminder1m
          : freq === 2 ? t.profile.budgetReminder2m
          : freq === 3 ? t.profile.budgetReminder3m
          : t.profile.budgetReminder6m
        return (
          <Banner
            onDismiss={dismissBudgetBanner}
            action={<NavLink to="/finances/budget" onClick={dismissBudgetBanner} className="arvo-btn arvo-btn--link shrink-0">{t.profile.budgetReminderGoTo}</NavLink>}
          >
            {t.profile.budgetReminderDue}: {t.profile.budgetReminderDueBody.replace('{freq}', freqLabel)}
          </Banner>
        )
      })() : null}

      <main className="flex-1 max-w-6xl 2xl:max-w-[1440px] mx-auto w-full px-4 2xl:px-8 py-6 sm:pb-6 main-content">
        <RouteErrorBoundary>
          <Outlet />
        </RouteErrorBoundary>
      </main>

      <div className="hidden sm:block max-w-6xl 2xl:max-w-[1440px] mx-auto w-full px-4 2xl:px-8 pb-2">
        <LoginFooter />
      </div>

      {/* Mobile bottom nav — floating glass pill, merged with sub-nav (Fase 2.1).
          Liquid-glass effect: the SVG filter (defined once below) refracts/distorts what's
          behind the pill instead of just blurring it flat, like iOS/Instagram's glass material.
          Applied to a dedicated backdrop layer (not the whole nav) so icons/text stay crisp —
          `filter` on the nav itself would distort its own content too. */}
      <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
        <defs>
          <filter id="arvo-liquid-glass" x="-30%" y="-30%" width="160%" height="160%">
            <feTurbulence type="fractalNoise" baseFrequency="0.006 0.010" numOctaves="3" seed="7" result="noise" />
            <feGaussianBlur in="noise" stdDeviation="1.2" result="sharpNoise" />
            <feDisplacementMap in="SourceGraphic" in2="sharpNoise" scale="110" xChannelSelector="R" yChannelSelector="B" />
          </filter>
        </defs>
      </svg>
      <nav
        className="sm:hidden fixed z-20"
        style={{
          bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
          left: '50%',
          transform: 'translateX(-50%)',
          width: navCollapsed ? 'calc(100% - 120px)' : 'calc(100% - 32px)',
          maxWidth: navCollapsed ? 220 : 360,
          borderRadius: 24,
          overflow: 'hidden',
          transition: 'width 320ms cubic-bezier(0.22,0.61,0.36,1), max-width 320ms cubic-bezier(0.22,0.61,0.36,1)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)',
        }}
      >
        {/* Backdrop layer: refracted blur + tint, sits behind the content layer. The SVG
            distortion must run BEFORE the blur in the filter list (CSS applies functions
            left-to-right) — distorting an already-blurred image barely shows, distorting the
            sharp backdrop first and blurring after keeps the warp visible. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', inset: 0,
            background: 'var(--arvo-glass-bg)',
            backdropFilter: 'url(#arvo-liquid-glass) blur(9px) saturate(220%)',
            WebkitBackdropFilter: 'blur(9px) saturate(220%)',
            border: '1px solid var(--arvo-glass-border)',
            borderRadius: 24,
            boxShadow: 'inset 0 1px 0 var(--arvo-glass-highlight), inset 0 -1px 0 rgba(0,0,0,0.06)',
          }}
        />
        {/* Specular highlight sweep — the glossy top-left shine real glass/Instagram's
            material has, that a flat blur alone never reads as "glass". */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', inset: 0, borderRadius: 24, pointerEvents: 'none',
            background: 'linear-gradient(115deg, var(--arvo-glass-highlight) 0%, transparent 18%, transparent 78%, var(--arvo-glass-highlight) 100%)',
            opacity: 0.5, mixBlendMode: 'overlay',
          }}
        />
        <div style={{ position: 'relative' }}>
        {activeSubItems.length > 0 && (
          <div
            style={{
              maxHeight: navCollapsed ? 0 : 48,
              opacity: navCollapsed ? 0 : 1,
              overflow: 'hidden',
              transition: 'max-height 260ms ease, opacity 180ms ease',
            }}
          >
            <div ref={subNavScrollRef} className="flex items-center gap-5 overflow-x-auto scrollbar-none" style={{ padding: '8px 14px 7px' }}>
              {activeSubItems.map(({ to, label, end }) => (
                <NavLink
                  key={to} to={to} end={end}
                  className="whitespace-nowrap shrink-0 transition-colors"
                  style={({ isActive }) => ({
                    fontFamily: "var(--arvo-font-body)", fontSize: 13.5, letterSpacing: '0.04em',
                    padding: '2px 1px 7px', borderBottom: isActive ? `2px solid ${sectionAccent}` : '2px solid transparent',
                    color: isActive ? 'var(--arvo-fg)' : 'var(--arvo-fg-muted)', textDecoration: 'none',
                    transition: 'color 160ms ease, border-color 160ms ease',
                  })}
                >{label}</NavLink>
              ))}
            </div>
            <div style={{ height: 1, margin: '0 14px', background: 'var(--arvo-border-soft)' }} />
          </div>
        )}
        <div
          ref={navRowRef}
          className="flex relative"
          style={{ padding: '5px' }}
          onTouchStart={(e) => {
            const idx = indexAtPoint(e.touches[0].clientX, e.touches[0].clientY)
            dragStartIndexRef.current = idx
            if (idx == null || !navRowRef.current) return
            setLiquidSettling(false)
            setDragHighlightIndex(idx)
            setLiquidX(e.touches[0].clientX - navRowRef.current.getBoundingClientRect().left)
          }}
          onTouchMove={(e) => {
            if (dragStartIndexRef.current == null || !navRowRef.current) return
            e.preventDefault()
            const rect = navRowRef.current.getBoundingClientRect()
            const rawX = e.touches[0].clientX - rect.left
            setLiquidX(Math.max(0, Math.min(rect.width, rawX))) // segue o dedo 1:1, sem transição
            const idx = indexAtPoint(e.touches[0].clientX, e.touches[0].clientY)
            if (idx != null) setDragHighlightIndex(idx)
          }}
          onTouchEnd={() => {
            const finalIndex = dragHighlightIndex
            if (finalIndex != null && finalIndex !== dragStartIndexRef.current) {
              const target = navItems[finalIndex]
              if (target) navigate(target.to)
            }
            // Encaixa a bolha no centro do item final com uma pequena "mola" (overshoot)
            // antes de sumir — é o toque de "vidro líquido" que faltava na v1.
            if (finalIndex != null) {
              setLiquidSettling(true)
              const center = itemCenterX(finalIndex)
              if (center != null) setLiquidX(center)
            }
            dragStartIndexRef.current = null
            setDragHighlightIndex(null)
            setTimeout(() => { setLiquidX(null); setLiquidSettling(false) }, 320)
          }}
        >
          {liquidX != null && (
            <div
              aria-hidden="true"
              style={{
                position: 'absolute', top: 5, bottom: 5, left: 0,
                width: `calc(${100 / navItems.length}% - 4px)`,
                borderRadius: 999,
                background: 'var(--arvo-glass-active-bg)',
                boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                transform: `translateX(${liquidX}px) translateX(-50%)`,
                transition: liquidSettling ? 'transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none',
                pointerEvents: 'none',
                zIndex: 0,
              }}
            />
          )}
          {navItems.map(({ to, label, match, icon }, i) => (
            <NavLink
              key={to} to={to}
              ref={(el) => { navItemRefs.current[i] = el }}
              className="flex-1 flex flex-col items-center shrink-0 relative"
              style={{
                fontFamily: "var(--arvo-font-body)",
                letterSpacing: '0.06em',
                fontSize: 10,
                gap: navCollapsed ? 0 : 4,
                padding: navCollapsed ? '9px 6px' : '6px 6px 7px',
                borderRadius: 999,
                zIndex: 1,
                color: (match || dragHighlightIndex === i) ? 'var(--arvo-fg)' : 'var(--arvo-fg-soft)',
                background: (liquidX == null && match) ? 'var(--arvo-glass-active-bg)' : 'transparent',
                boxShadow: (liquidX == null && match) ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                transform: dragHighlightIndex === i && liquidX != null && !liquidSettling ? 'scale(1.08)' : 'scale(1)',
                // overflow:hidden aqui (no próprio item flex, não só no label)
                // zera o "automatic minimum size" do item pela spec do flexbox —
                // sem isso, o label escondido ainda inflava a largura mínima do
                // item e empurrava o último ícone (Comunidade) pra fora da barra
                // ao recolher. Faz isso sem precisar animar width (que competia
                // com a transição do card inteiro e deixava o recolher travado).
                overflow: 'hidden',
                transition: dragHighlightIndex != null ? 'none' : 'all 240ms cubic-bezier(0.22,0.61,0.36,1)',
                textDecoration: 'none',
              }}
            >
              {cloneElement(icon, {
                style: { width: navCollapsed ? 18 : 24, height: navCollapsed ? 18 : 24, transition: 'width 240ms ease, height 240ms ease' },
              })}
              <span
                className="truncate text-center px-1 w-full"
                style={{
                  maxHeight: navCollapsed ? 0 : 14,
                  opacity: navCollapsed ? 0 : 1,
                  overflow: 'hidden',
                  transition: 'max-height 240ms ease, opacity 160ms ease',
                }}
              >{label}</span>
            </NavLink>
          ))}
        </div>
        </div>
      </nav>

      {showOnboarding && user?.id && <OnboardingOverlay userId={user.id} onDone={() => setShowOnboarding(false)} />}
      <ChatWidget
        visible={chatVisible}
        onDismiss={dismissChat}
        forceOpen={openChatNow}
        onForceOpenConsumed={() => setOpenChatNow(false)}
      />
    </div>
  )
}
