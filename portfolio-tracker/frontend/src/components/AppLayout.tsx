import { useState, useEffect, useRef, cloneElement } from 'react'
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useCurrency, type Currency } from '../contexts/CurrencyContext'
import { useTheme } from '../contexts/ThemeContext'
import { useI18n } from '../contexts/I18nContext'
import type React from 'react'
import { useNotificationsContext } from '../contexts/NotificationsContext'
import { resolveNotificationText, SEVERITY_COLORS, formatTimestamp } from '../lib/notifications'
import { apiFetch } from '../lib/api'
import LoginFooter from './LoginFooter'
import OnboardingOverlay from './OnboardingOverlay'
import LanguageSelector from './LanguageSelector'
import ChatWidget from './ChatWidget'
import SetupChecklist from './SetupChecklist'
import { Icon, type IconName } from './icons'
import { Banner } from './ui'

const onboardingKey = (userId: string) => `onboarding_v1_done_${userId}`
const CURRENCIES: Currency[] = ['BRL', 'USD', 'EUR']

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
  const { resolvedTheme } = useTheme()
  const { t, locale } = useI18n()
  const { active: activeNotifications, unreadCount, dismissAll } = useNotificationsContext()
  const location = useLocation()

  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showUserMenu,   setShowUserMenu]   = useState(false)
  const [showNotifMenu,  setShowNotifMenu]  = useState(false)
  const subNavScrollRef = useRef<HTMLDivElement>(null)
  const [navCollapsed,  setNavCollapsed]  = useState(false)
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
    const freq = parseInt(localStorage.getItem(`arvo_budget_reminder_freq_${user.id}`) ?? '0', 10)
    if (freq === 0) {
      const dismissed = localStorage.getItem(`arvo_budget_reminder_setup_dismissed_${user.id}`)
      if (!dismissed) setShowBudgetSetup(true)
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
  }, [user?.id])

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

  const inInvestimentos = location.pathname === '/dashboard' || location.pathname === '/' ||
    location.pathname.startsWith('/assets') ||
    location.pathname.startsWith('/performance') ||
    location.pathname.startsWith('/dividends') ||
    location.pathname.startsWith('/portfolio') ||
    location.pathname.startsWith('/diversification')
  const inFinances = location.pathname.startsWith('/finances')
  const inVoyage = location.pathname.startsWith('/voyage')
  const inInstitutions = location.pathname.startsWith('/institutions')

  const sectionAccent = inInvestimentos ? '#1B4FD8' : inFinances ? '#A36A52' : inVoyage ? '#D63B2F' : '#1F8A5B'

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
    { to: '/finances/shared', label: t.finances.navShared, end: false, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM2.5 13.5a5.5 5.5 0 0 1 11 0"/>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 4a2 2 0 1 1 0 4M13.5 12.5a4 4 0 0 0-2-1.5"/>
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

  const activeSubItems = inInvestimentos ? investimentosItems : inFinances ? financesItems : inVoyage ? voyageItems : []

  return (
    <div className={`min-h-screen flex flex-col${resolvedTheme === 'dark' ? ' dark' : ''}`} style={{ background: 'var(--arvo-bg)' }}>
      <header className="sticky top-0 z-10" style={{ background: 'var(--arvo-header-bg)', backdropFilter: 'blur(12px) saturate(1.05)', WebkitBackdropFilter: 'blur(12px) saturate(1.05)', borderBottom: '1px solid var(--arvo-border-soft)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>

        {/* ── Main bar ── */}
        <div className="h-14 flex items-center px-6 gap-4">

          {/* Logo wordmark + product name */}
          <Link
            to="/dashboard"
            className="shrink-0 flex items-center gap-2.5 hover:opacity-70 transition-opacity"
            style={{ textDecoration: 'none' }}
          >
            <img src={`/brand/logo/arvo-symbol-${resolvedTheme === 'dark' ? 'offwhite' : 'black'}.svg`} width="22" height="22" alt="" />
            <span style={{ fontFamily: "var(--arvo-font-display)", fontSize: 16, letterSpacing: '0.30em', textIndent: '0.30em', color: 'var(--arvo-fg)', lineHeight: 1 }}>arvo</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 14, borderLeft: '1px solid var(--arvo-border)', height: 24 }}>
            <span style={{ fontFamily: "var(--arvo-font-display)", fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: inVoyage ? '#D63B2F' : 'var(--arvo-fg-soft)', lineHeight: 1, transition: 'color 280ms' }}>
              {inVoyage ? 'Voyage' : 'Capital'}
            </span>
          </div>

          {/* Desktop — three section tabs (pill style) */}
          <nav className="hidden sm:flex flex-1 justify-center gap-1">
            {([
              { to: '/dashboard',    label: t.nav.investments,                         active: inInvestimentos },
              { to: '/finances',     label: t.nav.finances,                            active: inFinances },
              { to: '/voyage',       label: (t as any).nav?.voyage ?? 'Viagens',       active: inVoyage },
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
            {/* Eye: hide/show all values */}
            <button
              onClick={toggleHideValues}
              title={hideValues ? (t.common.showValues ?? 'Mostrar valores') : (t.common.hideValues ?? 'Ocultar valores')}
              style={{ height: 32, padding: '0 8px', borderRadius: 8, border: hideValues ? '1px solid var(--arvo-border)' : '1px solid transparent', background: hideValues ? 'var(--arvo-hover-bg)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, transition: 'all 160ms ease', flexShrink: 0 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--arvo-hover-bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = hideValues ? 'var(--arvo-hover-bg)' : 'transparent')}
            >
              {hideValues ? (
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="var(--arvo-fg-muted)" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                </svg>
              ) : (
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="var(--arvo-fg-soft)" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </button>
            {/* Bell: notifications */}
            <div ref={notifMenuRef} className="relative">
              <button
                onClick={() => setShowNotifMenu(v => !v)}
                title={t.notifications.title}
                style={{ height: 32, width: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0, transition: 'all 160ms ease' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--arvo-hover-bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="var(--arvo-fg-soft)" strokeWidth={1.8}>
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
                      const inner = (
                        <>
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}1A`, color }}><Icon name={iconName} size={15} /></div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate" style={{ color: 'var(--arvo-fg)' }}>{title}</p>
                            <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--arvo-fg-soft)' }}>
                              {subtitle ? `${subtitle} · ` : ''}{formatTimestamp(item.occurred_at, locale)}
                            </p>
                          </div>
                        </>
                      )
                      return item.link ? (
                        <Link key={item.key} to={item.link} onClick={() => setShowNotifMenu(false)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--arvo-surface-2)] transition-colors">{inner}</Link>
                      ) : (
                        <div key={item.key} className="flex items-center gap-3 px-4 py-2.5">{inner}</div>
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
            <SetupChecklist firstName={meta.first_name as string | undefined} />
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
                <div className="absolute right-0 top-full mt-2 w-56 rounded-xl shadow-lg py-1 z-50 max-h-[85vh] overflow-y-auto" style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border-soft)' }}>
                  <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--arvo-border-soft)' }}>
                    <span className="text-xs" style={{ color: 'var(--arvo-fg-soft)' }}>{t.common.language}</span>
                    <LanguageSelector />
                  </div>
                  <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--arvo-border-soft)' }}>
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
                  <Link to="/achievements" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors" style={{ color: 'var(--arvo-fg-muted)' }} onMouseEnter={e => (e.currentTarget.style.background='var(--arvo-hover-bg)')} onMouseLeave={e => (e.currentTarget.style.background='')}>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 shrink-0">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 1.5l1.8 3.6 4 .6-2.9 2.8.7 4L8 10.4l-3.6 1.9.7-4L2.2 5.7l4-.6L8 1.5z"/>
                    </svg>
                    {t.nav.achievements}
                  </Link>
                  <Link to="/notifications" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors" style={{ color: 'var(--arvo-fg-muted)' }} onMouseEnter={e => (e.currentTarget.style.background='var(--arvo-hover-bg)')} onMouseLeave={e => (e.currentTarget.style.background='')}>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 shrink-0">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 1.5A3 3 0 005 4.5v.75c0 1.42-.55 2.79-1.53 3.82l-.4.43A.75.75 0 003.6 10.8h8.8a.75.75 0 00.53-1.3l-.4-.43A5.25 5.25 0 0111 5.25V4.5A3 3 0 008 1.5zM6.5 12a1.5 1.5 0 003 0h-3z"/>
                    </svg>
                    {t.nav.notifications}
                    {unreadCount > 0 && (
                      <span className="ml-auto text-[10px] font-semibold rounded-full px-1.5 py-0.5" style={{ background: 'var(--arvo-red)', color: 'white', fontFamily: 'var(--arvo-font-body)', lineHeight: 1 }}>
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </Link>
                  <Link to="/favorites" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors" style={{ color: 'var(--arvo-fg-muted)' }} onMouseEnter={e => (e.currentTarget.style.background='var(--arvo-hover-bg)')} onMouseLeave={e => (e.currentTarget.style.background='')}>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 shrink-0">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 2.5c1.5-2 5.5-1.5 5.5 2.5 0 3-5.5 7.5-5.5 7.5S2.5 8 2.5 5C2.5 1 6.5.5 8 2.5z"/>
                    </svg>
                    {t.nav.favorites}
                  </Link>
                  <Link to="/archived" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors" style={{ color: 'var(--arvo-fg-muted)' }} onMouseEnter={e => (e.currentTarget.style.background='var(--arvo-hover-bg)')} onMouseLeave={e => (e.currentTarget.style.background='')}>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 shrink-0">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2 4.5h12v1.5H2zM3.5 6v7h9V6M6 9h4"/>
                    </svg>
                    {t.nav.archived}
                  </Link>
                  <Link to="/people" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors" style={{ color: 'var(--arvo-fg-muted)' }} onMouseEnter={e => (e.currentTarget.style.background='var(--arvo-hover-bg)')} onMouseLeave={e => (e.currentTarget.style.background='')}>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 shrink-0">
                      <circle cx="6" cy="5" r="2.5"/>
                      <path strokeLinecap="round" d="M1 13.5c0-2.8 2.2-5 5-5"/>
                      <circle cx="12" cy="6" r="2"/>
                      <path strokeLinecap="round" d="M16 14c0-2.2-1.8-4-4-4"/>
                    </svg>
                    Pessoas
                  </Link>
                  <Link to="/institutions" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors" style={{ color: 'var(--arvo-fg-muted)' }} onMouseEnter={e => (e.currentTarget.style.background='var(--arvo-hover-bg)')} onMouseLeave={e => (e.currentTarget.style.background='')}>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 shrink-0">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2 14V6l6-4.5L14 6v8H2zM6 14V9h4v5"/>
                    </svg>
                    {t.nav.institutions}
                  </Link>
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
                  <button onClick={() => signOut()} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors" style={{ color: 'var(--arvo-red)' }} onMouseEnter={e => (e.currentTarget.style.background='rgba(214,59,47,0.06)')} onMouseLeave={e => (e.currentTarget.style.background='')}>
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
                    fontFamily: "var(--arvo-font-body)", fontSize: 13, letterSpacing: '0.06em',
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
            {t.profile.budgetReminderDue} — {t.profile.budgetReminderDueBody.replace('{freq}', freqLabel)}
          </Banner>
        )
      })() : null}

      <main className="flex-1 max-w-6xl 2xl:max-w-[1440px] mx-auto w-full px-4 2xl:px-8 py-6 sm:pb-6 main-content">
        <Outlet />
      </main>

      <div className="hidden sm:block max-w-6xl 2xl:max-w-[1440px] mx-auto w-full px-4 2xl:px-8 pb-2">
        <LoginFooter />
      </div>

      {/* Mobile bottom nav — floating glass pill, merged with sub-nav (Fase 2.1) */}
      <nav
        className="sm:hidden fixed z-20"
        style={{
          bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'calc(100% - 32px)',
          maxWidth: 360,
          background: 'var(--arvo-glass-bg)',
          backdropFilter: 'blur(24px) saturate(200%)',
          WebkitBackdropFilter: 'blur(24px) saturate(200%)',
          border: '1px solid var(--arvo-glass-border)',
          borderRadius: 24,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06), inset 0 1px 0 var(--arvo-glass-highlight)',
          overflow: 'hidden',
        }}
      >
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
                    fontFamily: "var(--arvo-font-body)", fontSize: 12.5, letterSpacing: '0.04em',
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
        <div className="flex" style={{ padding: '5px' }}>
          {[
            { to: '/dashboard', label: t.nav.investments, match: inInvestimentos, accent: '#1B4FD8', icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.5l7.5-7.5 4 4L21 4.5M3 20.5h18" />
              </svg>
            )},
            { to: '/finances', label: t.nav.finances, match: inFinances, accent: '#A36A52', icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <circle cx="12" cy="12" r="9.75" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75v10.5M15 9.3c-.6-1.05-1.65-1.65-3-1.65-1.8 0-3.15 1.05-3.15 2.55S10.2 12.3 12 12.6s3.3 1.05 3.3 2.55-1.35 2.55-3.3 2.55c-1.35 0-2.55-.6-3.15-1.65" />
              </svg>
            )},
            { to: '/voyage', label: (t as any).nav?.voyage ?? 'Viagens', match: inVoyage, accent: '#D63B2F', icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2C8.134 2 5 5.134 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.866-3.134-7-7-7Z"/>
                <circle cx="12" cy="9" r="2.5"/>
              </svg>
            )},
            { to: '/people', label: 'Pessoas', match: location.pathname === '/people', accent: '#1F8A5B', icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <circle cx="9" cy="8" r="3.75"/>
                <path strokeLinecap="round" d="M2 21c0-4.2 3.1-7.5 7-7.5"/>
                <circle cx="18" cy="9" r="3"/>
                <path strokeLinecap="round" d="M24 21c0-3.3-2.7-6-6-6"/>
              </svg>
            )},
          ].map(({ to, label, match, icon }) => (
            <NavLink
              key={to} to={to}
              className="flex-1 flex flex-col items-center shrink-0"
              style={{
                fontFamily: "var(--arvo-font-body)",
                letterSpacing: '0.06em',
                fontSize: 10,
                gap: navCollapsed ? 0 : 4,
                padding: navCollapsed ? '9px 6px' : '6px 6px 7px',
                borderRadius: 999,
                color: match ? 'var(--arvo-fg)' : 'var(--arvo-fg-soft)',
                background: match ? 'var(--arvo-glass-active-bg)' : 'transparent',
                boxShadow: match ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 240ms cubic-bezier(0.22,0.61,0.36,1)',
                textDecoration: 'none',
              }}
            >
              {cloneElement(icon, {
                style: { width: navCollapsed ? 16 : 20, height: navCollapsed ? 16 : 20, transition: 'width 240ms ease, height 240ms ease' },
              })}
              <span
                className="truncate w-full text-center px-1"
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
