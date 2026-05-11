import { NavLink, Outlet, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useCurrency, type Currency } from '../contexts/CurrencyContext'

const navItems = [
  { to: '/',              label: 'Dashboard',   icon: '▦', end: true },
  { to: '/performance',   label: 'Performance', icon: '↗', end: false },
  { to: '/contributions', label: 'Aportes',     icon: '⊕', end: false },
]

const CURRENCIES: Currency[] = ['BRL', 'USD', 'EUR']

export default function AppLayout() {
  const { user, signOut } = useAuth()
  const { currency, setCurrency } = useCurrency()

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-5 min-w-0">
            <span className="font-bold text-[#001A70] text-base shrink-0">Portfolio Tracker</span>
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

          <div className="flex items-center gap-3 shrink-0">
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
            <Link to="/profile" className="text-xs text-gray-400 hidden sm:block hover:text-[#001A70] transition-colors">{user?.email}</Link>
            <button
              onClick={() => signOut()}
              className="text-xs text-gray-500 hover:text-red-600 transition-colors"
            >
              Sair
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
    </div>
  )
}
