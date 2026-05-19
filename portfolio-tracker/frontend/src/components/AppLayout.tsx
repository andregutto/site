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

  const [showOnboarding,   setShowOnboarding]   = useState(false)
  const [showUserMenu,     setShowUserMenu]     = useState(false)
  const [showPortfolioMenu,setShowPortfolioMenu]= useState(false)
  const [showFinancesMenu, setShowFinancesMenu] = useState(false)

  const userMenuRef      = useRef<HTMLDivElement>(null)
  const portfolioMenuRef = useRef<HTMLDivElement>(null)
  const financesMenuRef  = useRef<HTMLDivElement>(null)

  useClickOutside(userMenuRef,      () => setShowUserMenu(false),      showUserMenu)
  useClickOutside(portfolioMenuRef, () => setShowPortfolioMenu(false), showPortfolioMenu)
  useClickOutside(financesMenuRef,  () => setShowFinancesMenu(false),  showFinancesMenu)

  useEffect(() => {
    setShowPortfolioMenu(false)
    setShowFinancesMenu(false)
    setShowUserMenu(false)
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

  // Detect active group for dropdown highlight
  const inPortfolio = location.pathname.startsWith('/portfolio')
  const inFinances  = location.pathname.startsWith('/finances')

  const portfolioItems = [
    { to: '/portfolio',              label: t.nav.contributions },
    { to: '/portfolio/rebalance',    label: t.nav.rebalance     },
    { to: '/portfolio/institutions', label: t.nav.institutions  },
    { to: '/portfolio/classes',      label: t.nav.classes       },
    { to: '/portfolio/reports',      label: t.nav.ir            },
    { to: '/portfolio/indices',      label: t.nav.indices       },
  ]

  const financesItems = [
    { to: '/finances',              label: t.finances.navOverview,    end: true  },
    { to: '/finances/budget',       label: t.finances.navBudget,      end: false },
    { to: '/finances/transactions', label: t.finances.navTransactions, end: false },
    { to: '/finances/moments',      label: t.finances.navMoments,     end: false },
    { to: '/finances/freedom',      label: t.finances.navFreedom,     end: false },
    { to: '/finances/accounts',     label: t.finances.navAccounts,    end: false },
  ]

  const dropdownItemCls = 'flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap rounded-lg'
  const dropdownCls = 'absolute top-full mt-1.5 left-0 bg-white rounded-xl shadow-lg border border-gray-100 p-1.5 z-50'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="h-14 flex items-center px-6 gap-4">

          {/* Logo */}
          <a
            href="https://andregutto.com"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 transition-opacity duration-200 hover:opacity-70 tracking-[-0.2px]"
            style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, fontWeight: 400, color: '#1B2F4E', textDecoration: 'none' }}
          >André Gutto</a>

          {/* Desktop nav */}
          <div className="hidden sm:flex flex-1 justify-center min-w-0">
            <nav className="flex items-center gap-0.5">

              {/* Direct links */}
              {[
                { to: '/',            label: t.nav.dashboard,   end: true  },
                { to: '/performance', label: t.nav.performance, end: false },
              ].map(({ to, label, end }) => (
                <NavLink
                  key={to} to={to} end={end}
                  className={({ isActive }) =>
                    `px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      isActive ? 'bg-[#001A70]/10 text-[#001A70]' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                    }`
                  }
                >{label}</NavLink>
              ))}

              {/* Portfólio dropdown */}
              <div ref={portfolioMenuRef} className="relative">
                <button
                  onClick={() => { setShowPortfolioMenu(v => !v); setShowFinancesMenu(false) }}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    inPortfolio ? 'bg-[#001A70]/10 text-[#001A70]' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {t.nav.portfolio}
                  <svg className={`w-3 h-3 transition-transform ${showPortfolioMenu ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showPortfolioMenu && (
                  <div className={dropdownCls}>
                    <div className="grid grid-cols-2 gap-0.5">
                      {portfolioItems.map(({ to, label }) => (
                        <NavLink key={to} to={to} className={({ isActive }) => `${dropdownItemCls} ${isActive ? 'bg-[#001A70]/5 text-[#001A70] font-medium' : ''}`}>
                          {label}
                        </NavLink>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Finanças dropdown */}
              <div ref={financesMenuRef} className="relative">
                <button
                  onClick={() => { setShowFinancesMenu(v => !v); setShowPortfolioMenu(false) }}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    inFinances ? 'bg-[#001A70]/10 text-[#001A70]' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {t.nav.finances}
                  <svg className={`w-3 h-3 transition-transform ${showFinancesMenu ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showFinancesMenu && (
                  <div className={dropdownCls}>
                    <div className="grid grid-cols-2 gap-0.5">
                      {financesItems.map(({ to, label, end }) => (
                        <NavLink key={to} to={to} end={end} className={({ isActive }) => `${dropdownItemCls} ${isActive ? 'bg-[#001A70]/5 text-[#001A70] font-medium' : ''}`}>
                          {label}
                        </NavLink>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </nav>
          </div>

          {/* Right — currency + user */}
          <div className="flex items-center gap-3 shrink-0 ml-auto sm:ml-0">
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
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

      {/* Mobile bottom navigation */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-20 safe-bottom">
        <div className="flex">
          {[
            { to: '/',            label: t.nav.dashboard,  end: true,  icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            )},
            { to: '/performance', label: t.nav.performance, end: false, icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            )},
            { to: '/portfolio',   label: t.nav.portfolio,  end: false, icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.5l7.5-7.5 4 4L21 4.5M3 20.5h18" />
              </svg>
            )},
            { to: '/finances',    label: t.nav.finances,   end: false, icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75" />
              </svg>
            )},
            { to: '/profile',     label: t.nav.profile,    end: false, icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            )},
          ].map(({ to, label, end, icon }) => (
            <NavLink
              key={to} to={to} end={end}
              className={({ isActive }) =>
                `flex-1 py-2.5 flex flex-col items-center gap-0.5 transition-colors text-[11px] font-medium leading-tight ${
                  isActive ? 'text-[#001A70]' : 'text-gray-400'
                }`
              }
            >
              {icon}
              <span className="truncate w-full text-center px-0.5">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {showOnboarding && <OnboardingOverlay onDone={() => setShowOnboarding(false)} />}
    </div>
  )
}
