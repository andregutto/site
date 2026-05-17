import { useState, useEffect, useRef } from 'react'
import { NavLink, Outlet, Link } from 'react-router-dom'
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

export default function AppLayout() {
  const { user, signOut } = useAuth()
  const { currency, setCurrency } = useCurrency()
  const { t } = useI18n()
  const { totalXp } = useAchievementContext()
  const level = getLevel(totalXp)
  const levelProgress = getLevelProgress(totalXp)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showMoreSheet, setShowMoreSheet] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showUserMenu) return
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showUserMenu])

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

  const navItems = [
    { to: '/',               label: t.nav.dashboard,     icon: '▦', end: true },
    { to: '/performance',    label: t.nav.performance,   icon: '↗', end: false },
    { to: '/contributions',  label: t.nav.contributions, icon: '⊕', end: false },
    { to: '/rebalance',      label: t.nav.rebalance,     icon: '⇌', end: false },
    { to: '/by-institution', label: t.nav.institutions,  icon: '⊟', end: false },
    { to: '/classes',        label: t.nav.classes,       icon: '◈', end: false },
    { to: '/reports',        label: t.nav.ir,            icon: '⊞', end: false },
    { to: '/indices',        label: t.nav.indices,       icon: '◎', end: false },
    { to: '/archived',       label: t.nav.archived,      icon: '⊘', end: false },
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="h-14 flex items-center px-6 gap-4">

          {/* Logo — true left edge */}
          <a
            href="https://andregutto.com"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 transition-opacity duration-200 hover:opacity-70 tracking-[-0.2px]"
            style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, fontWeight: 400, color: '#1B2F4E', textDecoration: 'none' }}
          >André Gutto</a>

          {/* Nav — centered in remaining space via flex-1 wrapper */}
          <div className="hidden sm:flex flex-1 justify-center min-w-0">
            <nav className="flex items-center gap-0.5">
              {navItems.map(({ to, label, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-[#001A70]/10 text-[#001A70]'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                    }`
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>

          {/* Right — currency + user + sign out */}
          <div className="flex items-center gap-3 shrink-0 ml-auto sm:ml-0">
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
              {CURRENCIES.map(c => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                    currency === c
                      ? 'bg-white text-[#001A70] shadow-sm'
                      : 'text-gray-400 hover:text-gray-700'
                  }`}
                >
                  {c}
                </button>
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
                  {/* Language */}
                  <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-xs text-gray-500">Idioma</span>
                    <LanguageSelector />
                  </div>

                  {/* XP mini-bar */}
                  <div className="px-4 py-2.5 border-b border-gray-100">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-gray-500">{level.emoji} {level.name}</span>
                      <span className="text-xs font-bold text-[#001A70]">{totalXp} XP</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[#001A70] to-[#C9A227] rounded-full transition-all" style={{ width: `${levelProgress}%` }} />
                    </div>
                  </div>
                  <Link
                    to="/achievements"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <span>🏅</span> {t.nav.achievements}
                  </Link>
                  <Link
                    to="/favorites"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <span>★</span> {t.nav.favorites}
                  </Link>
                  <Link
                    to="/profile"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <span>👤</span> {t.nav.profile}
                  </Link>
                </div>
              )}
            </div>

            <button
              onClick={() => signOut()}
              className="text-xs text-gray-500 hover:text-red-600 transition-colors whitespace-nowrap"
            >
              {t.nav.signout}
            </button>
          </div>
        </div>

      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 pb-24 sm:pb-6">
        <Outlet />
      </main>

      <div className="hidden sm:block max-w-6xl mx-auto w-full px-4 pb-2">
        <LoginFooter />
      </div>

      {/* Mobile bottom navigation bar */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-20 safe-bottom">
        <div className="flex">
          {[
            { to: '/',               label: t.nav.dashboard,    icon: '▦', end: true  },
            { to: '/performance',    label: t.nav.performance,  icon: '↗', end: false },
            { to: '/contributions',  label: t.nav.contributions,icon: '⊕', end: false },
            { to: '/by-institution', label: t.nav.institutions, icon: '⊟', end: false },
          ].map(({ to, label, icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex-1 py-2.5 flex flex-col items-center gap-0.5 transition-colors text-[11px] font-medium leading-tight ${
                  isActive ? 'text-[#001A70]' : 'text-gray-400'
                }`
              }
            >
              <span className="text-base leading-none">{icon}</span>
              <span className="truncate w-full text-center px-0.5">{label}</span>
            </NavLink>
          ))}
          <button
            onClick={() => setShowMoreSheet(true)}
            className="flex-1 py-2.5 flex flex-col items-center gap-0.5 text-gray-400 text-[11px] font-medium leading-tight"
          >
            <span className="text-base leading-none">≡</span>
            <span>Mais</span>
          </button>
        </div>
      </nav>

      {/* "Mais" bottom sheet */}
      {showMoreSheet && (
        <div
          className="sm:hidden fixed inset-0 z-30 bg-black/40"
          onClick={() => setShowMoreSheet(false)}
        >
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl pt-4 pb-8 px-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
            <div className="grid grid-cols-4 gap-3">
              {[
                { to: '/rebalance',    label: t.nav.rebalance,  icon: '⇌' },
                { to: '/classes',      label: t.nav.classes,    icon: '◈' },
                { to: '/reports',      label: t.nav.ir,         icon: '⊞' },
                { to: '/indices',      label: t.nav.indices,    icon: '◎' },
                { to: '/achievements', label: t.nav.achievements, icon: '🏅' },
                { to: '/archived',     label: t.nav.archived,    icon: '⊘' },
                { to: '/profile',      label: t.nav.profile,     icon: '👤' },
              ].map(({ to, label, icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setShowMoreSheet(false)}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-1.5 py-3 rounded-2xl transition-colors ${
                      isActive ? 'bg-[#001A70]/10 text-[#001A70]' : 'text-gray-500 bg-gray-50'
                    }`
                  }
                >
                  <span className="text-xl leading-none">{icon}</span>
                  <span className="text-[11px] font-medium">{label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}

      {showOnboarding && (
        <OnboardingOverlay onDone={() => setShowOnboarding(false)} />
      )}
    </div>
  )
}
