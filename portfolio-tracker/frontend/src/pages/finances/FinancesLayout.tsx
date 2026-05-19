import { NavLink, Outlet } from 'react-router-dom'
import { useI18n } from '../../contexts/I18nContext'
import { useCurrency } from '../../contexts/CurrencyContext'
import type { Currency } from '../../contexts/CurrencyContext'

const FINANCE_CURRENCIES: Currency[] = ['EUR', 'BRL']

export default function FinancesLayout() {
  const { t } = useI18n()
  const { currency, setCurrency } = useCurrency()
  const tabs = [
    { to: '/finances',              label: t.finances.navOverview,     end: true  },
    { to: '/finances/budget',       label: t.finances.navBudget,       end: false },
    { to: '/finances/transactions', label: t.finances.navTransactions,  end: false },
    { to: '/finances/moments',      label: t.finances.navMoments,      end: false },
    { to: '/finances/freedom',      label: t.finances.navFreedom,      end: false },
    { to: '/finances/accounts',     label: t.finances.navAccounts,     end: false },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <nav className="flex gap-0.5 bg-gray-100 rounded-xl p-1 overflow-x-auto max-w-full">
          {tabs.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-white text-[#001A70] shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="flex gap-0.5 bg-gray-100 rounded-xl p-1 shrink-0">
          {FINANCE_CURRENCIES.map(c => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                currency === c
                  ? 'bg-white text-[#001A70] shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >{c}</button>
          ))}
        </div>
      </div>
      <Outlet />
    </div>
  )
}
