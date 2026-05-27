import { useState, useEffect, useRef } from 'react'
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useCurrency, type Currency } from '../contexts/CurrencyContext'
import { useI18n } from '../contexts/I18nContext'
import { useAchievementContext } from '../contexts/AchievementContext'
import { getLevel, getLevelProgress } from '../lib/achievementDefs'
import { apiFetch } from '../lib/api'
import LoginFooter from './LoginFooter'
import OnboardingOverlay from './OnboardingOverlay'
import LanguageSelector from './LanguageSelector'
import ChatWidget from './ChatWidget'

const onboardingKey = (userId: string) => `onboarding_v1_done_${userId}`
const CURRENCIES: Currency[] = ['BRL', 'USD', 'EUR']

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
  const { currency, setCurrency } = useCurrency()
  const { t } = useI18n()
  const { totalXp } = useAchievementContext()
  const location = useLocation()
  const level = getLevel(totalXp)
  const levelProgress = getLevelProgress(totalXp)

  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showUserMenu,   setShowUserMenu]   = useState(false)
  const subNavScrollRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    setShowUserMenu(false)
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

  useEffect(() => {
    if (!user?.id) return
    if (localStorage.getItem(onboardingKey(user.id))) return
    apiFetch<{ id: number }[]>('/assets')
      .then(assets => { if (assets.length === 0) setShowOnboarding(true) })
      .catch(() => {})
  }, [user?.id])

  const meta = user?.user_metadata ?? {}
  const headerLabel = [meta.first_name, meta.last_name].filter(Boolean).join(' ') || user?.email || ''
  const avatarUrl = meta.avatar_url as string | undefined
  const avatarInitials = headerLabel.slice(0, 2).toUpperCase()

  const inInvestimentos = location.pathname === '/dashboard' || location.pathname === '/' ||
    location.pathname.startsWith('/performance') ||
    location.pathname.startsWith('/dividends') ||
    location.pathname.startsWith('/portfolio')
  const inFinances = location.pathname.startsWith('/finances')
  const inInstitutions = location.pathname.startsWith('/institutions')

  const sectionAccent = inInvestimentos ? '#1B4FD8' : inFinances ? '#A36A52' : 'var(--arvo-black)'

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
    { to: '/dividends', label: t.nav.dividends, end: true, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <circle cx="8" cy="8" r="6.5"/><path strokeLinecap="round" strokeLinejoin="round" d="M8 5v6M6 7h3a1 1 0 010 2H6"/>
      </svg>
    )},
    { to: '/portfolio', label: t.nav.contributions, end: true, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 1v14M1 8h14"/>
      </svg>
    )},
    { to: '/portfolio/rebalance', label: t.nav.rebalance, end: false, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 2v12M4 14h8M4 6l-3 4h6L4 6zM12 4l-3 4h6l-3-4z"/>
      </svg>
    )},
    { to: '/portfolio/classes', label: t.nav.classes, end: false, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 1.5H14v4.5L8 12a1.4 1.4 0 01-2 0L2 8a1.4 1.4 0 010-2l6-4.5z"/>
        <circle cx="11.5" cy="4.5" r="1" fill="currentColor" stroke="none"/>
      </svg>
    )},
    { to: '/portfolio/reports', label: t.nav.ir, end: false, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 1.5h6.5L13 5v9.5H3zM9 1.5V5h4M5 8h6M5 11h4"/>
      </svg>
    )},
    { to: '/portfolio/indices', label: t.nav.indices, end: false, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M1 12l4-4 3 3 7-7M11.5 4H15v3.5"/>
      </svg>
    )},
  ]

  const financesItems = [
    { to: '/finances', label: t.finances.navOverview, end: true, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 7.5L8 2l6.5 5.5V14.5H10V10H6v4.5H1.5z"/>
      </svg>
    )},
    { to: '/finances/budget', label: t.finances.navBudget, end: false, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <circle cx="8" cy="8" r="6.5"/><circle cx="8" cy="8" r="3"/>
        <circle cx="8" cy="8" r=".75" fill="currentColor" stroke="none"/>
      </svg>
    )},
    { to: '/finances/transactions', label: t.finances.navTransactions, end: false, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <rect x="1" y="3" width="14" height="10" rx="1.5"/><path strokeLinecap="round" d="M1 6.5h14M4 10h2M9 10h3"/>
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
  ]

  const activeSubItems = inInvestimentos ? investimentosItems : inFinances ? financesItems : []

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--arvo-offwhite)' }}>
      <header className="sticky top-0 z-10" style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px) saturate(1.05)', WebkitBackdropFilter: 'blur(12px) saturate(1.05)', borderBottom: '1px solid var(--arvo-border-soft)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>

        {/* ── Main bar ── */}
        <div className="h-14 flex items-center px-6 gap-4">

          {/* Logo wordmark + product name */}
          <Link
            to="/dashboard"
            className="shrink-0 flex items-center gap-2.5 hover:opacity-70 transition-opacity"
            style={{ textDecoration: 'none' }}
          >
            <img src="/brand/logo/arvo-symbol-black.svg" width="22" height="22" alt="" />
            <span style={{ fontFamily: "var(--arvo-font-display)", fontSize: 16, letterSpacing: '0.30em', textIndent: '0.30em', color: 'var(--arvo-black)', lineHeight: 1 }}>arvo</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 14, borderLeft: '1px solid var(--arvo-border)', height: 24 }}>
            <span style={{ fontFamily: "var(--arvo-font-display)", fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(13,13,13,0.55)', lineHeight: 1 }}>Capital</span>
          </div>

          {/* Desktop — three section tabs (pill style) */}
          <nav className="hidden sm:flex flex-1 justify-center gap-1">
            {([
              { to: '/dashboard',    label: t.nav.investments, active: inInvestimentos },
              { to: '/finances',     label: t.nav.finances,    active: inFinances },
              { to: '/institutions', label: t.nav.institutions, active: inInstitutions },
            ] as Array<{ to: string; label: string; active: boolean }>).map(({ to, label, active }) => (
              <NavLink
                key={to} to={to}
                className={() => `px-4 py-1.5 rounded-full text-xs whitespace-nowrap transition-all`}
                style={{ fontFamily: "var(--arvo-font-body)", letterSpacing: '0.16em', textTransform: 'uppercase',
                  background: active ? 'rgba(13,13,13,0.92)' : 'transparent',
                  color: active ? 'var(--arvo-offwhite)' : 'rgba(13,13,13,0.72)',
                  transition: 'all 280ms cubic-bezier(0.22,0.61,0.36,1)' }}
              >{label}</NavLink>
            ))}
          </nav>

          {/* Right — user */}
          <div className="flex items-center gap-3 shrink-0 ml-auto">
            <div ref={userMenuRef} className="relative">
              <button
                onClick={() => setShowUserMenu(v => !v)}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                title={headerLabel}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-7 h-7 rounded-full object-cover" />
                ) : (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px]" style={{ background: 'var(--arvo-black)', color: 'var(--arvo-gold)', fontFamily: "var(--arvo-font-body)", letterSpacing: '0.08em' }}>{avatarInitials}</div>
                )}
                <span className="text-xs max-w-[100px] truncate transition-colors" style={{ color: 'rgba(13,13,13,0.5)' }}>{headerLabel}</span>
                <svg className={`w-3 h-3 text-gray-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showUserMenu && (
                <div className="absolute right-0 top-full mt-2 w-56 rounded-xl shadow-lg py-1 z-50 max-h-[85vh] overflow-y-auto" style={{ background: '#FFFFFF', border: '1px solid var(--arvo-border-soft)' }}>
                  <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--arvo-border-soft)' }}>
                    <span className="text-xs" style={{ color: 'rgba(13,13,13,0.45)' }}>{t.common.language}</span>
                    <LanguageSelector />
                  </div>
                  <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--arvo-border-soft)' }}>
                    <span className="text-xs" style={{ color: 'rgba(13,13,13,0.45)' }}>{t.currency?.label ?? 'Moeda'}</span>
                    <div className="flex items-center rounded-full p-0.5 gap-0.5" style={{ background: 'rgba(13,13,13,0.07)' }}>
                      {CURRENCIES.map(c => (
                        <button key={c} onClick={() => setCurrency(c)}
                          className="px-2.5 py-1 text-xs rounded-full transition-all"
                          style={currency === c
                            ? { fontFamily: "var(--arvo-font-body)", background: 'var(--arvo-black)', color: 'var(--arvo-offwhite)', letterSpacing: '0.06em' }
                            : { fontFamily: "var(--arvo-font-body)", color: 'rgba(13,13,13,0.45)', letterSpacing: '0.06em' }}
                        >{c}</button>
                      ))}
                    </div>
                  </div>
                  <div className="px-4 py-2.5" style={{ borderBottom: '1px solid var(--arvo-border-soft)' }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs" style={{ color: 'rgba(13,13,13,0.45)' }}>{(t.levels as Record<string, string>)[level.key] ?? level.name}</span>
                      <span className="text-xs" style={{ fontFamily: "var(--arvo-font-body)", color: 'var(--arvo-black)' }}>{totalXp} XP</span>
                    </div>
                    <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(13,13,13,0.08)' }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${levelProgress}%`, background: 'linear-gradient(90deg, var(--arvo-black), var(--arvo-gold))' }} />
                    </div>
                  </div>
                  <Link to="/achievements" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors" style={{ color: 'rgba(13,13,13,0.75)' }} onMouseEnter={e => (e.currentTarget.style.background='rgba(13,13,13,0.04)')} onMouseLeave={e => (e.currentTarget.style.background='')}>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 shrink-0">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 1.5l1.8 3.6 4 .6-2.9 2.8.7 4L8 10.4l-3.6 1.9.7-4L2.2 5.7l4-.6L8 1.5z"/>
                    </svg>
                    {t.nav.achievements}
                  </Link>
                  <Link to="/favorites" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors" style={{ color: 'rgba(13,13,13,0.75)' }} onMouseEnter={e => (e.currentTarget.style.background='rgba(13,13,13,0.04)')} onMouseLeave={e => (e.currentTarget.style.background='')}>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 shrink-0">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 2.5c1.5-2 5.5-1.5 5.5 2.5 0 3-5.5 7.5-5.5 7.5S2.5 8 2.5 5C2.5 1 6.5.5 8 2.5z"/>
                    </svg>
                    {t.nav.favorites}
                  </Link>
                  <Link to="/archived" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors" style={{ color: 'rgba(13,13,13,0.75)' }} onMouseEnter={e => (e.currentTarget.style.background='rgba(13,13,13,0.04)')} onMouseLeave={e => (e.currentTarget.style.background='')}>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 shrink-0">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2 4.5h12v1.5H2zM3.5 6v7h9V6M6 9h4"/>
                    </svg>
                    {t.nav.archived}
                  </Link>
                  <Link to="/profile" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors" style={{ color: 'rgba(13,13,13,0.75)' }} onMouseEnter={e => (e.currentTarget.style.background='rgba(13,13,13,0.04)')} onMouseLeave={e => (e.currentTarget.style.background='')}>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 shrink-0">
                      <circle cx="8" cy="5" r="2.5"/><path strokeLinecap="round" d="M2.5 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/>
                    </svg>
                    {t.nav.profile}
                  </Link>
                  <button onClick={openChat} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors" style={{ color: 'rgba(13,13,13,0.75)' }} onMouseEnter={e => (e.currentTarget.style.background='rgba(13,13,13,0.04)')} onMouseLeave={e => (e.currentTarget.style.background='')}>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 shrink-0">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2 2.5h12a1 1 0 011 1v6a1 1 0 01-1 1H9L6 13v-2.5H2a1 1 0 01-1-1v-6a1 1 0 011-1z"/>
                    </svg>
                    {t.chat.open}
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

        {/* ── Sub-nav bar — desktop only ── */}
        {activeSubItems.length > 0 && (
          <div className="hidden sm:block" style={{ borderTop: '1px solid var(--arvo-border-soft)', background: 'rgba(0,0,0,0.025)' }}>
            <div className="flex items-center justify-center gap-1 px-6 py-2">
              {activeSubItems.map(({ to, label, end }) => (
                <NavLink
                  key={to} to={to} end={end}
                  className="flex items-center gap-2 whitespace-nowrap transition-all"
                  style={({ isActive }) => isActive
                    ? { fontFamily: "var(--arvo-font-body)", fontSize: 11, letterSpacing: '0.08em', padding: '7px 14px', borderRadius: 8, border: '1px solid var(--arvo-border)', background: 'white', color: 'var(--arvo-fg)', boxShadow: '0 1px 2px rgba(13,13,13,0.04)', textDecoration: 'none' }
                    : { fontFamily: "var(--arvo-font-body)", fontSize: 11, letterSpacing: '0.08em', padding: '7px 14px', borderRadius: 8, border: '1px solid transparent', background: 'transparent', color: 'rgba(13,13,13,0.70)', textDecoration: 'none' }}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span style={{ width: 5, height: 5, borderRadius: 999, background: sectionAccent, flexShrink: 0, display: 'inline-block' }} />}
                      {label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        )}

      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 pb-28 sm:pb-6 main-content">
        <Outlet />
      </main>

      <div className="hidden sm:block max-w-6xl mx-auto w-full px-4 pb-2">
        <LoginFooter />
      </div>

      {/* Mobile sub-nav — fixed just above the bottom nav */}
      {activeSubItems.length > 0 && (
        <nav className="sm:hidden fixed left-0 right-0 z-20" style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))', background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderTop: '1px solid var(--arvo-border-soft)', position: 'fixed' }}>
          <div ref={subNavScrollRef} className="flex items-center gap-1 px-3 py-2 overflow-x-auto scrollbar-none">
            {activeSubItems.map(({ to, label, end }) => (
              <NavLink
                key={to} to={to} end={end}
                className="flex items-center gap-2 whitespace-nowrap transition-all"
                style={({ isActive }) => isActive
                  ? { fontFamily: "var(--arvo-font-body)", fontSize: 13, letterSpacing: '0.05em', padding: '9px 14px', borderRadius: 9, border: '1px solid var(--arvo-border)', background: 'white', color: 'var(--arvo-fg)', boxShadow: '0 1px 2px rgba(13,13,13,0.06)', textDecoration: 'none' }
                  : { fontFamily: "var(--arvo-font-body)", fontSize: 13, letterSpacing: '0.05em', padding: '9px 14px', borderRadius: 9, border: '1px solid transparent', background: 'transparent', color: 'rgba(13,13,13,0.5)', textDecoration: 'none' }}
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span style={{ width: 5, height: 5, borderRadius: 999, background: sectionAccent, flexShrink: 0, display: 'inline-block' }} />}
                    {label}
                  </>
                )}
              </NavLink>
            ))}
            {/* Spacer so last item clears the chevron indicator */}
            <div style={{ minWidth: 44, flexShrink: 0 }} />
          </div>

          {/* Soft fade + chevron — signals scrollability */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute', right: 0, top: 0, bottom: 0, width: 52, pointerEvents: 'none',
              background: 'linear-gradient(to left, rgba(255,255,255,0.97) 45%, rgba(255,255,255,0))',
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke={sectionAccent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </div>
        </nav>
      )}

      {/* Mobile bottom navigation */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-20 safe-bottom" style={{ background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderTop: '1px solid var(--arvo-border-soft)' }}>
        <div className="flex">
          {[
            { to: '/dashboard', label: t.nav.investments, match: inInvestimentos, icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.5l7.5-7.5 4 4L21 4.5M3 20.5h18" />
              </svg>
            )},
            { to: '/finances', label: t.nav.finances, match: inFinances, icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75" />
              </svg>
            )},
            { to: '/institutions', label: t.nav.institutions, match: inInstitutions, icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" />
              </svg>
            )},
          ].map(({ to, label, match, icon }) => (
            <NavLink
              key={to} to={to}
              className="flex-1 py-2.5 flex flex-col items-center gap-0.5 transition-colors text-[11px] leading-tight"
              style={{ fontFamily: "var(--arvo-font-body)", color: match ? 'var(--arvo-black)' : 'rgba(13,13,13,0.35)', letterSpacing: '0.06em' }}
            >
              {icon}
              <span className="truncate w-full text-center px-0.5">{label}</span>
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
