import { useState, useEffect, useRef } from 'react'
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

const SIZE = 28
const R = 10
const CIRC = 2 * Math.PI * R

export default function SetupChecklist({ firstName }: Props) {
  const { t } = useI18n()
  const s = (t as unknown as Record<string, Record<string, string>>).setup
  const navigate = useNavigate()
  const [hidden, setHidden] = useState(() => !!sessionStorage.getItem(SESSION_KEY))
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<SetupState | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useClickOutside(wrapRef, () => setOpen(false), open)

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
    setOpen(false)
  }

  if (hidden || !state) return null

  const steps = [
    { key: 'assets',   done: state.hasAssets,      label: s.stepAssets,   to: '/import-b3' },
    { key: 'account',  done: state.hasAccount,     label: s.stepAccount,  to: '/finances/accounts' },
    { key: 'income',   done: state.hasIncome,      label: s.stepIncome,   to: '/finances' },
    { key: 'freedom',  done: state.hasFreedomPlan, label: s.stepFreedom,  to: '/finances/freedom' },
    { key: 'planning', done: state.hasPlanning,    label: s.stepPlanning, to: '/finances/budget' },
  ]

  const doneCount = steps.filter(st => st.done).length
  if (doneCount === steps.length) return null

  const pct = doneCount / steps.length
  const strokeOffset = CIRC * (1 - pct)

  const name = firstName?.split(' ')[0] ?? ''

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {/* Circle trigger */}
      <button
        onClick={() => setOpen(v => !v)}
        title={s.title}
        style={{
          width: SIZE, height: SIZE,
          borderRadius: '50%',
          border: 'none',
          background: open ? 'rgba(27,79,216,0.08)' : 'transparent',
          cursor: 'pointer',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.15s',
        }}
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {/* Background ring */}
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={R}
            fill="none"
            stroke="#1B4FD8"
            strokeWidth={2.5}
            strokeOpacity={0.18}
          />
          {/* Progress arc */}
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={R}
            fill="none"
            stroke="#1B4FD8"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={strokeOffset}
            style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dashoffset 0.4s ease' }}
          />
          {/* Center count */}
          <text
            x={SIZE / 2} y={SIZE / 2 + 3.5}
            textAnchor="middle"
            fontSize={7.5}
            fontFamily="var(--arvo-font-body)"
            fontWeight={700}
            fill="#1B4FD8"
          >
            {doneCount}/{steps.length}
          </text>
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            width: 280,
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
            border: '1px solid var(--arvo-border-soft)',
            background: '#FFFFFF',
            zIndex: 50,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--arvo-border-soft)' }}>
            <p style={{ margin: 0, fontFamily: 'var(--arvo-font-body)', fontSize: 12, fontWeight: 600, color: 'var(--arvo-black)', letterSpacing: '0.04em' }}>
              {name ? `${name}, ` : ''}{s.title}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <div style={{ flex: 1, height: 3, background: 'rgba(27,79,216,0.12)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct * 100}%`, background: '#1B4FD8', borderRadius: 2, transition: 'width 0.4s ease' }} />
              </div>
              <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, fontWeight: 600, color: '#1B4FD8', flexShrink: 0 }}>
                {doneCount}/{steps.length}
              </span>
            </div>
          </div>

          {/* Steps */}
          <div style={{ padding: '6px 0' }}>
            {steps.map(step => (
              <button
                key={step.key}
                onClick={() => {
                  if (!step.done) { setOpen(false); navigate(step.to) }
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '9px 16px',
                  border: 'none', background: 'none',
                  cursor: step.done ? 'default' : 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={e => { if (!step.done) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(27,79,216,0.04)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '' }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${step.done ? '#22c55e' : '#1B4FD8'}`,
                  background: step.done ? '#22c55e' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {step.done && (
                    <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span style={{
                  flex: 1, fontSize: 13, fontFamily: 'var(--arvo-font-body)',
                  color: step.done ? 'rgba(13,13,13,0.38)' : 'rgba(13,13,13,0.8)',
                  textDecoration: step.done ? 'line-through' : 'none',
                }}>
                  {step.label}
                </span>
                {!step.done && (
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="rgba(27,79,216,0.4)" strokeWidth={2.2} style={{ flexShrink: 0 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>

          {/* Footer: dismiss */}
          <div style={{ padding: '8px 16px 12px', borderTop: '1px solid var(--arvo-border-soft)' }}>
            <button
              onClick={dismiss}
              style={{
                width: '100%', padding: '6px 12px',
                borderRadius: 8, border: '1px solid rgba(13,13,13,0.12)',
                background: 'none', cursor: 'pointer',
                fontFamily: 'var(--arvo-font-body)', fontSize: 12,
                color: 'rgba(13,13,13,0.45)', textAlign: 'center',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(13,13,13,0.04)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              {s.dismiss}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
