import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../contexts/I18nContext'
import { apiFetch } from '../lib/api'

const DISMISS_KEY = 'arvo_setup_checklist_dismissed_v1'

interface SetupState {
  hasAssets: boolean
  hasAccount: boolean
  hasIncome: boolean
  hasFreedomPlan: boolean
  hasPlanning: boolean
}

interface Props {
  hasAssets: boolean
}

export default function SetupChecklist({ hasAssets }: Props) {
  const { t } = useI18n()
  const s = (t as unknown as Record<string, Record<string, string>>).setup
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(DISMISS_KEY))
  const [state, setState] = useState<SetupState | null>(null)

  useEffect(() => {
    if (dismissed) return
    Promise.all([
      apiFetch<unknown[]>('/finances/accounts').catch(() => [] as unknown[]),
      apiFetch<{ monthly_net?: number }>('/finances/income').catch(() => ({})),
      apiFetch<Array<{ is_active: boolean }>>('/finances/freedom-plans').catch(() => []),
      apiFetch<Array<{ budget_monthly?: number }>>('/finances/categories').catch(() => []),
    ]).then(([accounts, income, plans, categories]) => {
      setState({
        hasAssets,
        hasAccount: Array.isArray(accounts) && accounts.length > 0,
        hasIncome: ((income as { monthly_net?: number }).monthly_net ?? 0) > 0,
        hasFreedomPlan: Array.isArray(plans) && plans.some(p => p.is_active),
        hasPlanning: Array.isArray(categories) && categories.some(c => (c.budget_monthly ?? 0) > 0),
      })
    })
  }, [dismissed, hasAssets])

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  if (dismissed || !state) return null

  const steps = [
    { key: 'assets',      done: state.hasAssets,             label: s.stepAssets,      desc: s.stepAssetsDesc,      to: '/import-b3' },
    { key: 'account',     done: state.hasAccount,            label: s.stepAccount,     desc: s.stepAccountDesc,     to: '/finances/accounts' },
    { key: 'income',      done: state.hasIncome,             label: s.stepIncome,      desc: s.stepIncomeDesc,      to: '/finances' },
    { key: 'freedom',     done: state.hasFreedomPlan,        label: s.stepFreedom,     desc: s.stepFreedomDesc,     to: '/finances/freedom' },
    { key: 'planning',    done: state.hasPlanning,            label: s.stepPlanning,     desc: s.stepPlanningDesc,     to: '/finances/budget' },
  ]

  const doneCount = steps.filter(st => st.done).length
  if (doneCount === steps.length) return null

  const pct = Math.round((doneCount / steps.length) * 100)

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h2 className="text-sm font-semibold text-gray-900">{s.title}</h2>
            <span className="text-xs text-gray-400">
              {s.progress.replace('{done}', String(doneCount)).replace('{total}', String(steps.length))}
            </span>
          </div>
          <p className="text-xs text-gray-400">{s.subtitle}</p>
          <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#0D0D0D] rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <button
          onClick={dismiss}
          className="text-xs text-gray-300 hover:text-gray-500 transition-colors shrink-0 mt-0.5"
          title={s.dismiss}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="border-t border-gray-50 divide-y divide-gray-50">
        {steps.map(step => (
          <button
            key={step.key}
            onClick={() => !step.done && navigate(step.to)}
            disabled={step.done}
            className={`w-full px-5 py-3 flex items-center gap-3 text-left transition-colors ${
              step.done ? 'opacity-50 cursor-default' : 'hover:bg-gray-50'
            }`}
          >
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
              step.done
                ? 'border-emerald-500 bg-emerald-500'
                : 'border-gray-300 bg-white'
            }`}>
              {step.done && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${step.done ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                {step.label}
              </p>
              {!step.done && (
                <p className="text-xs text-gray-400 truncate">{step.desc}</p>
              )}
            </div>
            {!step.done && (
              <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
