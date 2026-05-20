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

const ONBOARDING_KEY = 'onboarding_v1_done'
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
  const [showMobileMenu, setShowMobileMenu] = useState(false)

  const userMenuRef = useRef<HTMLDivElement>(null)
  useClickOutside(userMenuRef, () => setShowUserMenu(false), showUserMenu)

  useEffect(() => {
    setShowUserMenu(false)
    setShowMobileMenu(false)
  }, [location.pathname])

  useEffect(() => {
    if (localStorage.getItem(ONBOARDING_KEY)) return
    apiFetch<{ id: number }[]>('/assets')
      .then(assets => { if (assets.length === 0) setShowOnboarding(true) })
      .catch(() => {})
  }, [])

  const meta = user?.user_metadata ?? {}
  const headerLabel = [meta.first_name, meta.last_name].filter(Boolean).join(' ') || user?.email || ''
  const avatarUrl = meta.avatar_url as string | undefined
  const avatarInitials = headerLabel.slice(0, 2).toUpperCase()

  const inInvestimentos = location.pathname === '/' ||
    location.pathname.startsWith('/performance') ||
    location.pathname.startsWith('/portfolio')
  const inFinances = location.pathname.startsWith('/finances')

  const investimentosItems = [
    { to: '/', label: t.nav.dashboard, end: true, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <rect x="1" y="9" width="3" height="6" rx=".5"/><rect x="6.5" y="5.5" width="3" height="9.5" rx=".5"/><rect x="12" y="2" width="3" height="13" rx=".5"/>
      </svg>
    )},
    { to: '/performance', label: t.nav.performance, end: false, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M1 12l4-4 3 3 7-7M11.5 4H15v3.5"/>
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
    { to: '/portfolio/institutions', label: t.nav.institutions, end: false, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 14.5h13M3 14.5V7.5M7 14.5V7.5M10 14.5V7.5M13 14.5V7.5M1 6.5L8 1.5l7 5"/>
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
    { to: '/finances/freedom', label: t.finances.navFreedom, end: false, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M1 12.5a7 7 0 0114 0"/>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 9V5M5.5 6.5L8 5l2.5 1.5"/>
      </svg>
    )},
    { to: '/finances/accounts', label: t.finances.navAccounts, end: false, icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
        <rect x="1" y="4" width="14" height="9" rx="1.5"/><path strokeLinecap="round" d="M1 7.5h14"/>
        <circle cx="11.5" cy="10" r="1" fill="currentColor" stroke="none"/>
      </svg>
    )},
  ]

  const activeSubItems = inInvestimentos ? investimentosItems : inFinances ? financesItems : []

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">

        {/* ── Main bar ── */}
        <div className="h-14 flex items-center px-6 gap-4">

          {/* Logo */}
          <a
            href="https://andregutto.com"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 transition-opacity duration-200 hover:opacity-70 tracking-[-0.2px]"
            style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, fontWeight: 400, color: '#1B2F4E', textDecoration: 'none' }}
          >André Gutto</a>

          {/* Desktop — two section tabs */}
          <nav className="hidden sm:flex flex-1 justify-center gap-1">
            <NavLink
              to="/"
              className={() =>
                `px-4 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  inInvestimentos ? 'bg-[#001A70]/10 text-[#001A70] font-semibold' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                }`
              }
            >{t.nav.investments}</NavLink>
            <NavLink
              to="/finances"
              className={() =>
                `px-4 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  inFinances ? 'bg-[#001A70]/10 text-[#001A70] font-semibold' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                }`
              }
            >{t.nav.finances}</NavLink>
          </nav>

          {/* Right — currency + user */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
              {CURRENCIES.map(c => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                    currency === c ? 'bg-white text-[#001A70] shadow-sm' : 'text-gray-400 hover:text-gray-700'
                  }`}
                >{c}</button>
              ))}
            </div>

            <div ref={userMenuRef} className="relative hidden sm:block">
              <button
                onClick={() => setShowUserMenu(v => !v)}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                title={headerLabel}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-7 h-7 rounded-full object-cover" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-[#001A70] text-white flex items-center justify-center text-[10px] font-bold">{avatarInitials}</div>
                )}
                <span className="text-xs text-gray-400 hover:text-[#001A70] transition-colors max-w-[100px] truncate">{headerLabel}</span>
                <svg className={`w-3 h-3 text-gray-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showUserMenu && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                  <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-xs text-gray-500">{t.common.language}</span>
                    <LanguageSelector />
                  </div>
                  <div className="px-4 py-2.5 border-b border-gray-100">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-gray-500">{level.emoji} {level.name}</span>
                      <span className="text-xs font-bold text-[#001A70]">{totalXp} XP</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[#001A70] to-[#C9A227] rounded-full transition-all" style={{ width: `${levelProgress}%` }} />
                    </div>
                  </div>
                  <Link to="/achievements" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                    <span>🏅</span> {t.nav.achievements}
                  </Link>
                  <Link to="/favorites" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                    <span>★</span> {t.nav.favorites}
                  </Link>
                  <Link to="/archived" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 shrink-0">
                      <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v.5H2v-.5ZM2 5.5h12v7A1.5 1.5 0 0 1 12.5 14h-9A1.5 1.5 0 0 1 2 12.5v-7Zm4.5 2a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1h-3Z" />
                    </svg>
                    {t.nav.archived}
                  </Link>
                  <Link to="/profile" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                    <span>👤</span> {t.nav.profile}
                  </Link>
                  <button onClick={() => signOut()} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors">
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

        {/* ── Sub-nav bar (desktop only, always visible when in a section) ── */}
        {activeSubItems.length > 0 && (
          <div className="border-t border-gray-100 bg-gray-50/60">
            <div className="flex items-center gap-0.5 px-4 sm:px-6 py-1.5 overflow-x-auto scrollbar-none">
              {activeSubItems.map(({ to, label, end, icon }) => (
                <NavLink
                  key={to} to={to} end={end}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-white text-[#001A70] shadow-sm border border-gray-100'
                        : 'text-gray-500 hover:text-gray-800 hover:bg-white/70'
                    }`
                  }
                >
                  <span className="text-gray-400 flex items-center">{icon}</span>
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        )}

        {/* ── Mobile drawer ── */}
        {showMobileMenu && (
          <div className="sm:hidden absolute top-full left-0 right-0 bg-white border-b border-gray-100 shadow-lg z-40 max-h-[85vh] overflow-y-auto">
            <div className="px-4 py-3 space-y-1">

              {/* User card */}
              <div className="flex items-center gap-3 px-3 py-2.5">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-9 h-9 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-[#001A70] text-white flex items-center justify-center text-xs font-bold shrink-0">{avatarInitials}</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{headerLabel}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[#001A70] to-[#C9A227] rounded-full" style={{ width: `${levelProgress}%` }} />
                    </div>
                    <span className="text-[10px] font-bold text-[#001A70] shrink-0">{level.emoji} {totalXp} XP</span>
                  </div>
                </div>
              </div>

              {/* Settings row */}
              <div className="flex items-center gap-2 px-3 py-1.5">
                <span className="text-xs text-gray-400 mr-1">{t.common.language}</span>
                <LanguageSelector />
                <div className="flex-1" />
                <span className="text-xs text-gray-400 mr-1">{t.currency?.label ?? 'Moeda'}</span>
                <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
                  {CURRENCIES.map(c => (
                    <button key={c} onClick={() => setCurrency(c)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                        currency === c ? 'bg-white text-[#001A70] shadow-sm' : 'text-gray-400 hover:text-gray-700'
                      }`}
                    >{c}</button>
                  ))}
                </div>
              </div>

              {/* Profile links */}
              <div className="border-t border-gray-100 pt-1">
                {[
                  { to: '/profile',      label: t.nav.profile,      icon: '👤' },
                  { to: '/achievements', label: t.nav.achievements, icon: '🏅' },
                  { to: '/favorites',    label: t.nav.favorites,    icon: '★'  },
                  { to: '/archived',     label: t.nav.archived,     icon: '📦' },
                ].map(({ to, label, icon }) => (
                  <NavLink key={to} to={to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                        isActive ? 'bg-[#001A70]/10 text-[#001A70] font-medium' : 'text-gray-700 hover:bg-gray-50'
                      }`
                    }
                  >
                    <span className="w-4 text-center">{icon}</span>
                    {label}
                  </NavLink>
                ))}
                <button
                  onClick={() => signOut()}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-500 hover:bg-red-50 transition-colors"
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 shrink-0">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 11.5L14 8l-3.5-3.5M14 8H6M6 2.5H3A1.5 1.5 0 0 0 1.5 4v8A1.5 1.5 0 0 0 3 13.5h3"/>
                  </svg>
                  {t.nav.signout}
                </button>
              </div>

              {/* Navigation */}
              <div className="border-t border-gray-100 pt-1">
                <p className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{t.nav.investments}</p>
                {investimentosItems.map(({ to, label, end, icon }) => (
                  <NavLink key={to} to={to} end={end}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                        isActive ? 'bg-[#001A70]/10 text-[#001A70] font-medium' : 'text-gray-700 hover:bg-gray-50'
                      }`
                    }
                  >
                    <span className="w-4 h-4 shrink-0 text-gray-400 flex items-center">{icon}</span>
                    {label}
                  </NavLink>
                ))}
              </div>

              <div className="border-t border-gray-100 pt-1">
                <p className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{t.nav.finances}</p>
                {financesItems.map(({ to, label, end, icon }) => (
                  <NavLink key={to} to={to} end={end}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                        isActive ? 'bg-[#001A70]/10 text-[#001A70] font-medium' : 'text-gray-700 hover:bg-gray-50'
                      }`
                    }
                  >
                    <span className="w-4 h-4 shrink-0 text-gray-400 flex items-center">{icon}</span>
                    {label}
                  </NavLink>
                ))}
              </div>

            </div>
          </div>
        )}
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 pb-24 sm:pb-6">
        <Outlet />
      </main>

      <div className="hidden sm:block max-w-6xl mx-auto w-full px-4 pb-2">
        <LoginFooter />
      </div>

      {/* Mobile bottom navigation */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-20 safe-bottom">
        <div className="flex">
          {[
            { to: '/', label: t.nav.investments, end: false, match: inInvestimentos, icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.5l7.5-7.5 4 4L21 4.5M3 20.5h18" />
              </svg>
            )},
            { to: '/finances', label: t.nav.finances, end: false, match: inFinances, icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75" />
              </svg>
            )},
            { to: '/profile', label: t.nav.profile, end: false, match: location.pathname.startsWith('/profile'), icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            )},
          ].map(({ to, label, end: _end, match, icon }) => (
            <NavLink
              key={to} to={to}
              className={() =>
                `flex-1 py-2.5 flex flex-col items-center gap-0.5 transition-colors text-[11px] font-medium leading-tight ${
                  match ? 'text-[#001A70]' : 'text-gray-400'
                }`
              }
            >
              {icon}
              <span className="truncate w-full text-center px-0.5">{label}</span>
            </NavLink>
          ))}
          {/* Menu button */}
          <button
            onClick={() => setShowMobileMenu(v => !v)}
            className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 transition-colors text-[11px] font-medium leading-tight ${showMobileMenu ? 'text-[#001A70]' : 'text-gray-400'}`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
            <span>Menu</span>
          </button>
        </div>
      </nav>

      {showOnboarding && <OnboardingOverlay onDone={() => setShowOnboarding(false)} />}
    </div>
  )
}
