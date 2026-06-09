import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../contexts/I18nContext'
import { apiFetch } from '../lib/api'

const SESSION_KEY = 'arvo_setup_checklist_hidden'

interface SetupState {
  hasAssets: boolean
  hasAccount: boolean
  hasIncome: boolean
  hasFreedomPlan: boolean
  hasPlanning: boolean
}

interface Props {
  firstName?: string
}

export default function SetupChecklist({ firstName }: Props) {
  const { t } = useI18n()
  const s = (t as unknown as Record<string, Record<string, string>>).setup
  const navigate = useNavigate()
  const [hidden, setHidden] = useState(() => !!sessionStorage.getItem(SESSION_KEY))
  const [expanded, setExpanded] = useState(false)
  const [state, setState] = useState<SetupState | null>(null)

  useEffect(() => {
    if (hidden) return
    Promise.all([
      apiFetch<unknown[]>('/assets').catch(() => [] as unknown[]),
      apiFetch<unknown[]>('/finances/accounts').catch(() => [] as unknown[]),
      apiFetch<{ monthly_net?: number }>('/finances/income').catch(() => ({})),
      apiFetch<Array<{ is_active: boolean }>>('/finances/freedom-plans').catch(() => []),
      apiFetch<Array<{ budget_monthly?: number }>>('/finances/categories').catch(() => []),
    ]).then(([assets, accounts, income, plans, categories]) => {
      setState({
        hasAssets: Array.isArray(assets) && assets.length > 0,
        hasAccount: Array.isArray(accounts) && accounts.length > 0,
        hasIncome: ((income as { monthly_net?: number }).monthly_net ?? 0) > 0,
        hasFreedomPlan: Array.isArray(plans) && plans.some((p: { is_active: boolean }) => p.is_active),
        hasPlanning: Array.isArray(categories) && categories.some((c: { budget_monthly?: number }) => (c.budget_monthly ?? 0) > 0),
      })
    })
  }, [hidden])

  function dismiss() {
    sessionStorage.setItem(SESSION_KEY, '1')
    setHidden(true)
  }

  if (hidden || !state) return null

  const steps = [
    { key: 'assets',   done: state.hasAssets,      label: s.stepAssets,   desc: s.stepAssetsDesc,   to: '/import-b3' },
    { key: 'account',  done: state.hasAccount,     label: s.stepAccount,  desc: s.stepAccountDesc,  to: '/finances/accounts' },
    { key: 'income',   done: state.hasIncome,      label: s.stepIncome,   desc: s.stepIncomeDesc,   to: '/finances' },
    { key: 'freedom',  done: state.hasFreedomPlan, label: s.stepFreedom,  desc: s.stepFreedomDesc,  to: '/finances/freedom' },
    { key: 'planning', done: state.hasPlanning,    label: s.stepPlanning, desc: s.stepPlanningDesc, to: '/finances/budget' },
  ]

  const doneCount = steps.filter(st => st.done).length
  if (doneCount === steps.length) return null

  const pct = Math.round((doneCount / steps.length) * 100)
  const name = firstName?.split(' ')[0] ?? ''

  return (
    <div style={{ borderBottom: '1px solid rgba(27,79,216,0.12)', background: 'rgba(27,79,216,0.04)' }}>
      {/* Strip row */}
      <div
        style={{ maxWidth: 1152, margin: '0 auto', padding: '0 16px', height: 44, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}
      >
        <span style={{ fontSize: 15, flexShrink: 0 }}>🏆</span>
        <span style={{ fontSize: 12, fontFamily: 'var(--arvo-font-body)', color: 'rgba(13,13,13,0.65)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {name ? `${name}, ` : ''}{s.title}
        </span>
        {/* Progress bar */}
        <div style={{ width: 56, height: 4, background: 'rgba(27,79,216,0.15)', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: '#1B4FD8', borderRadius: 2, transition: 'width 0.4s ease' }} />
        </div>
        <span style={{ fontSize: 11, fontFamily: 'var(--arvo-font-body)', color: '#1B4FD8', fontWeight: 600, flexShrink: 0 }}>
          {doneCount}/{steps.length}
        </span>
        <svg
          width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(27,79,216,0.65)" strokeWidth={2.2}
          style={{ flexShrink: 0, transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'none' }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6"/>
        </svg>
        <button
          onClick={e => { e.stopPropagation(); dismiss() }}
          title={s.dismiss}
          style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'rgba(13,13,13,0.3)', display: 'flex', alignItems: 'center', lineHeight: 1 }}
        >
          <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Expanded step list */}
      {expanded && (
        <div style={{ borderTop: '1px solid rgba(27,79,216,0.10)', maxWidth: 1152, margin: '0 auto', padding: '10px 16px 14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6 }}>
            {steps.map(step => (
              <button
                key={step.key}
                onClick={() => { if (!step.done) { setExpanded(false); navigate(step.to) } }}
                disabled={step.done}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: `1px solid ${step.done ? 'rgba(34,197,94,0.25)' : 'rgba(27,79,216,0.18)'}`, background: step.done ? 'rgba(34,197,94,0.05)' : '#fff', cursor: step.done ? 'default' : 'pointer', textAlign: 'left' }}
              >
                <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${step.done ? '#22c55e' : '#1B4FD8'}`, background: step.done ? '#22c55e' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {step.done && (
                    <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span style={{ fontSize: 12, fontFamily: 'var(--arvo-font-body)', fontWeight: 500, color: step.done ? 'rgba(13,13,13,0.38)' : 'rgba(13,13,13,0.8)', textDecoration: step.done ? 'line-through' : 'none', flex: 1, textAlign: 'left' }}>
                  {step.label}
                </span>
                {!step.done && (
                  <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="rgba(27,79,216,0.5)" strokeWidth={2.2} style={{ flexShrink: 0 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
