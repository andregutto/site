import { useState, useEffect } from 'react'
import { NavLink, Outlet, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useCurrency, type Currency } from '../contexts/CurrencyContext'
import { useI18n } from '../contexts/I18nContext'
import { apiFetch } from '../lib/api'
import LoginFooter from './LoginFooter'
import OnboardingOverlay from './OnboardingOverlay'

const ONBOARDING_KEY = 'onboarding_v1_done'

const CURRENCIES: Currency[] = ['BRL', 'USD', 'EUR']

export default function AppLayout() {
  const { user, signOut } = useAuth()
  const { currency, setCurrency } = useCurrency()
  const { t } = useI18n()
  const [showOnboarding, setShowOnboarding] = useState(false)

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
    { to: '/import/b3',     label: 'Importar B3',       icon: '⇩', end: false },
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-5 min-w-0">
            <a
              href="https://andregutto.com"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 transition-opacity duration-200 hover:opacity-70 tracking-[-0.2px]"
              style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 19, fontWeight: 400, color: '#1B2F4E', textDecoration: 'none' }}
            >André Gutto</a>
            <nav className="hidden sm:flex items-center gap-1">
              {navItems.map(({ to, label, icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-[#001A70]/10 text-[#001A70]'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                    }`
                  }
                >
                  <span className="text-xs">{icon}</span>
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Currency selector */}
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

            <Link to="/profile" className="hidden sm:flex items-center gap-2 hover:opacity-80 transition-opacity" title={headerLabel}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-[#001A70] text-white flex items-center justify-center text-[10px] font-bold">{avatarInitials}</div>
              )}
              <span className="text-xs text-gray-400 hover:text-[#001A70] transition-colors truncate max-w-[100px]">{headerLabel}</span>
            </Link>
            <button
              onClick={() => signOut()}
              className="text-xs text-gray-500 hover:text-red-600 transition-colors"
            >
              {t.nav.signout}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        <nav className="sm:hidden flex border-t border-gray-100">
          {navItems.map(({ to, label, icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex-1 py-2.5 text-xs font-medium flex flex-col items-center gap-0.5 transition-colors ${
                  isActive ? 'text-[#001A70]' : 'text-gray-400'
                }`
              }
            >
              <span>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        <Outlet />
      </main>

      <div className="max-w-6xl mx-auto w-full px-4 pb-2">
        <LoginFooter />
      </div>

      {showOnboarding && (
        <OnboardingOverlay onDone={() => setShowOnboarding(false)} />
      )}
    </div>
  )
}
