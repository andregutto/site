import { NavLink, Outlet } from 'react-router-dom'
import { useI18n } from '../../contexts/I18nContext'

export default function FinancesLayout() {
  const { t } = useI18n()
  const tabs = [
    { to: '/finances',              label: t.finances.navOverview,     end: true  },
    { to: '/finances/budget',       label: t.finances.navBudget,       end: false },
    { to: '/finances/transactions', label: t.finances.navTransactions,  end: false },
    { to: '/finances/accounts',     label: t.finances.navAccounts,     end: false },
  ]

  return (
    <div className="space-y-5">
      <nav className="flex gap-0.5 bg-gray-100 rounded-xl p-1 w-fit">
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
      <Outlet />
    </div>
  )
}
