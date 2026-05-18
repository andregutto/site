import { NavLink, Outlet } from 'react-router-dom'
import { useI18n } from '../../contexts/I18nContext'

export default function PortfolioLayout() {
  const { t } = useI18n()
  const tabs = [
    { to: '/portfolio',              label: t.nav.contributions, end: true  },
    { to: '/portfolio/rebalance',    label: t.nav.rebalance,    end: false },
    { to: '/portfolio/institutions', label: t.nav.institutions,  end: false },
    { to: '/portfolio/classes',      label: t.nav.classes,      end: false },
    { to: '/portfolio/reports',      label: t.nav.ir,           end: false },
    { to: '/portfolio/indices',      label: t.nav.indices,      end: false },
  ]

  return (
    <div className="space-y-5">
      <nav className="flex gap-0.5 bg-gray-100 rounded-xl p-1 w-fit overflow-x-auto max-w-full">
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
