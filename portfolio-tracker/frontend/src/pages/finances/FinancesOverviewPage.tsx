import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'

interface Envelope {
  id: number
  name: string
  icon: string
  color: string
  pct_target: number
  type: string
  budget_amount: number
  categories: { budget_monthly: number | null }[]
}

interface BudgetData {
  income: { monthly_net: number; currency: string }
  envelopes: Envelope[]
}

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

export default function FinancesOverviewPage() {
  const { t } = useI18n()
  const [data, setData]     = useState<BudgetData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<BudgetData>('/finances/budget')
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{t.finances.overviewTitle}</h1>
        <p className="text-sm text-gray-400 mt-0.5">{t.finances.overviewSubtitle}</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center text-gray-400 text-sm">
        Carregando…
      </div>
    </div>
  )

  // No income configured yet
  if (!data || data.income.monthly_net === 0) return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{t.finances.overviewTitle}</h1>
        <p className="text-sm text-gray-400 mt-0.5">{t.finances.overviewSubtitle}</p>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
        <p className="text-3xl mb-3">💰</p>
        <p className="text-gray-600 font-medium text-sm mb-1">Configure sua renda mensal para começar</p>
        <p className="text-gray-400 text-xs mb-4">Acesse Budget para definir sua renda e envelopes</p>
        <Link to="/finances/budget" className="inline-block bg-[#001A70] text-white text-sm px-5 py-2 rounded-xl hover:opacity-80 transition-opacity">
          Configurar budget
        </Link>
      </div>
    </div>
  )

  const { income, envelopes } = data
  const totalCategoryBudget = envelopes.reduce((s, e) => s + e.categories.reduce((cs, c) => cs + (c.budget_monthly ?? 0), 0), 0)
  const unallocated = income.monthly_net - totalCategoryBudget

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{t.finances.overviewTitle}</h1>
        <p className="text-sm text-gray-400 mt-0.5">{t.finances.overviewSubtitle}</p>
      </div>

      {/* Income */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Renda mensal</p>
          <p className="text-2xl font-bold text-gray-900">{fmt(income.monthly_net, income.currency)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Orçado</p>
          <p className="text-2xl font-bold text-gray-900">{fmt(totalCategoryBudget, income.currency)}</p>
        </div>
        <div className={`rounded-2xl border shadow-sm p-5 ${unallocated < 0 ? 'bg-red-50 border-red-100' : unallocated === 0 ? 'bg-green-50 border-green-100' : 'bg-amber-50 border-amber-100'}`}>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{unallocated >= 0 ? 'Não alocado' : 'Excedente'}</p>
          <p className={`text-2xl font-bold ${unallocated < 0 ? 'text-red-600' : unallocated === 0 ? 'text-green-600' : 'text-amber-700'}`}>
            {fmt(Math.abs(unallocated), income.currency)}
          </p>
        </div>
      </div>

      {/* Envelopes quick view */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
        <div className="px-5 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 text-sm">Envelopes</h2>
          <Link to="/finances/budget" className="text-xs text-[#001A70] hover:opacity-70 transition-opacity">Ver budget →</Link>
        </div>
        {envelopes.map(env => {
          const catTotal = env.categories.reduce((s, c) => s + (c.budget_monthly ?? 0), 0)
          const pct      = income.monthly_net > 0 ? (catTotal / income.monthly_net) * 100 : 0
          const over     = pct > env.pct_target
          const met      = env.type === 'investment' && pct >= env.pct_target
          return (
            <div key={env.id} className="px-5 py-3 flex items-center gap-3">
              <span className="text-xl leading-none w-7 shrink-0">{env.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700">{env.name}</span>
                  <span className={`text-xs font-semibold ${over ? 'text-red-500' : met ? 'text-green-600' : 'text-gray-500'}`}>
                    {pct.toFixed(1)}% <span className="font-normal text-gray-400">/ {env.pct_target}%</span>
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(pct / env.pct_target * 100, 100)}%`, backgroundColor: over ? '#ef4444' : met ? '#10b981' : env.color }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Next steps */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5">
        <h3 className="font-semibold text-indigo-900 text-sm mb-2">Próximos passos</h3>
        <ul className="space-y-1.5">
          <li className="flex items-center gap-2 text-xs text-indigo-700">
            <span>📊</span> <Link to="/finances/budget" className="hover:underline">Revise seu budget por categoria</Link>
          </li>
          <li className="flex items-center gap-2 text-xs text-indigo-700">
            <span>🏦</span> <Link to="/finances/accounts" className="hover:underline">Conecte sua conta bancária</Link>
          </li>
          <li className="flex items-center gap-2 text-xs text-indigo-700">
            <span>📋</span> <Link to="/finances/transactions" className="hover:underline">Importe suas transações</Link>
          </li>
          <li className="flex items-center gap-2 text-xs text-indigo-700">
            <span>🎯</span> <Link to="/finances/freedom" className="hover:underline">Configure seu plano de Liberdade Financeira</Link>
          </li>
        </ul>
      </div>
    </div>
  )
}
