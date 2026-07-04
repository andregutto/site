import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../contexts/I18nContext'
import { apiFetch } from '../lib/api'

const STORAGE_PREFIX = 'arvo_setup_checklist_hidden_'
// Evento global disparado pelo botão "Ver checklist de configuração" no Perfil —
// o componente mora persistentemente no header, então reabrir de outro lugar da
// UI precisa de um jeito de "acordá-lo" de novo em vez de só mexer no localStorage
// (que ele não re-lê sozinho enquanto está montado).
export const REOPEN_SETUP_CHECKLIST_EVENT = 'arvo:reopen-setup-checklist'

interface SetupState {
  hasAssets: boolean
  hasAccount: boolean
  hasIncome: boolean
  hasFreedomPlan: boolean
  hasPlanning: boolean
}

// O que fica salvo ao dispensar: não só "escondido", mas uma foto de quais passos
// já estavam concluídos naquele momento — assim dá pra saber depois se algo NOVO
// foi desbloqueado (ex: conectou um banco) e reabrir sozinho pra comemorar/mostrar
// o que falta, em vez de ficar escondido para sempre mesmo com progresso novo.
interface DismissedSnapshot {
  hiddenAt: string
  snapshot: SetupState
}

function readDismissedSnapshot(storageKey: string | null): DismissedSnapshot | null {
  if (!storageKey) return null
  const raw = localStorage.getItem(storageKey)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && parsed.snapshot) return parsed as DismissedSnapshot
  } catch {
    // Formato antigo (só '1', sem snapshot) — trata como "sem dados de progresso",
    // qualquer item concluído no futuro já é motivo suficiente pra reabrir.
  }
  return { hiddenAt: '', snapshot: { hasAssets: false, hasAccount: false, hasIncome: false, hasFreedomPlan: false, hasPlanning: false } }
}

interface Props {
  firstName?: string
  userId?: string
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

const SIZE = 32
const R = 13
const CIRC = 2 * Math.PI * R

export default function SetupChecklist({ firstName, userId }: Props) {
  const { t } = useI18n()
  const s = (t as unknown as Record<string, Record<string, string>>).setup
  const navigate = useNavigate()
  const storageKey = userId ? `${STORAGE_PREFIX}${userId}` : null
  const [hidden, setHidden] = useState(() => !!(storageKey && localStorage.getItem(storageKey)))
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<SetupState | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useClickOutside(wrapRef, () => setOpen(false), open)

  // Re-sync the dismissed flag when the signed-in user changes (account
  // switch in the same browser) — each account has its own storage key, but
  // the initial useState above only runs once per mount.
  useEffect(() => {
    setHidden(!!(storageKey && localStorage.getItem(storageKey)))
  }, [storageKey])

  // Reabrir manualmente a partir do Perfil: limpa a dispensa e já expande o
  // painel, pra confirmar visualmente que funcionou.
  useEffect(() => {
    function onReopen() {
      if (storageKey) localStorage.removeItem(storageKey)
      setHidden(false)
      setOpen(true)
    }
    window.addEventListener(REOPEN_SETUP_CHECKLIST_EVENT, onReopen)
    return () => window.removeEventListener(REOPEN_SETUP_CHECKLIST_EVENT, onReopen)
  }, [storageKey])

  useEffect(() => {
    // Mesmo dispensado, continua buscando o estado em segundo plano — é o que
    // permite comparar com a foto salva e reabrir sozinho se algo novo foi
    // concluído (ex: conectou um banco depois de ter ignorado o checklist).
    Promise.all([
      apiFetch<Array<{ id: number }>>('/assets').catch(() => [] as Array<{ id: number }>),
      apiFetch<Array<{ linked_asset_id?: number | null }>>('/finances/accounts').catch(() => []),
      apiFetch<{ monthly_net?: number }>('/finances/income').catch(() => ({})),
      apiFetch<Array<{ is_active: boolean }>>('/finances/freedom-plans').catch(() => []),
      apiFetch<Array<{ budget_monthly?: number; name_key?: string }>>('/finances/categories').catch(() => []),
    ]).then(([assets, accounts, income, plans, categories]) => {
      // Onboarding's "add bank account" step auto-creates a linked Caixa/cash
      // asset so the balance shows in net worth — that's not the user
      // importing real portfolio holdings, so it shouldn't count here.
      const linkedAssetIds = new Set(
        (accounts ?? []).map(a => a.linked_asset_id).filter((id): id is number => id != null)
      )
      const realAssets = (assets ?? []).filter(a => !linkedAssetIds.has(a.id))

      // Onboarding's "monthly income" step auto-seeds a Salary category with
      // budget_monthly = the salary so it shows in budget reports — that's
      // not the user setting deliberate spending goals.
      const planningCategories = (categories ?? []).filter(c => c.name_key !== 'categorySalary')

      const freshState: SetupState = {
        hasAssets: realAssets.length > 0,
        hasAccount: Array.isArray(accounts) && accounts.length > 0,
        hasIncome: ((income as { monthly_net?: number }).monthly_net ?? 0) > 0,
        hasFreedomPlan: Array.isArray(plans) && plans.some((p: { is_active: boolean }) => p.is_active),
        hasPlanning: planningCategories.some(c => (c.budget_monthly ?? 0) > 0),
      }
      setState(freshState)

      if (hidden) {
        const dismissed = readDismissedSnapshot(storageKey)
        const unlockedSomethingNew = dismissed && (Object.keys(freshState) as (keyof SetupState)[])
          .some(k => freshState[k] && !dismissed.snapshot[k])
        if (unlockedSomethingNew) {
          if (storageKey) localStorage.removeItem(storageKey)
          setHidden(false)
        }
      }
    })
  }, [hidden, storageKey])

  function dismiss() {
    if (storageKey && state) {
      localStorage.setItem(storageKey, JSON.stringify({ hiddenAt: new Date().toISOString(), snapshot: state } satisfies DismissedSnapshot))
    }
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
            strokeWidth={3}
            strokeOpacity={0.15}
          />
          {/* Progress arc */}
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={R}
            fill="none"
            stroke="#1B4FD8"
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={strokeOffset}
            style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dashoffset 0.4s ease' }}
          />
          {/* Center: Arvo logo (viewBox 174×180 → ~14px, centered at 16,16) */}
          <g transform="translate(9, 8.76) scale(0.0805)" fill="#1B4FD8">
            <path d="M96.9642 82.5762C83.7642 28.1762 141.798 5.2429 172.464 0.576233C173.464 15.7429 159.764 53.3762 96.9642 82.5762Z"/>
            <path d="M165.464 82.5762V53.5762L136.964 73.9631V111.674C144.263 106.015 151.778 100.102 155.964 96.5762C163.564 90.1762 165.464 84.5762 165.464 82.5762Z" opacity="0.8"/>
            <path d="M121.464 85.0507V123.576C125.207 120.732 131.014 116.287 136.964 111.674V73.9631L121.464 85.0507Z" opacity="0.65"/>
            <path d="M96.9642 102.576L121.464 123.576V85.0507L96.9642 102.576Z" opacity="0.55"/>
            <path d="M121.464 155.576V123.576L96.9642 102.576V178.576L121.464 155.576Z" opacity="0.75"/>
            <path d="M0.513985 24.5762V51.5762C0.513985 53.5762 -0.135759 66.6762 7.46424 73.0762L44.514 101.576V155.076L69.014 178.076V82.0762L37.9642 56.0762L0.513985 24.5762Z" opacity="0.85"/>
          </g>
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
            background: 'var(--arvo-surface)',
            zIndex: 50,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--arvo-border-soft)' }}>
            <p style={{ margin: 0, fontFamily: 'var(--arvo-font-body)', fontSize: 12, fontWeight: 600, color: 'var(--arvo-fg)', letterSpacing: '0.04em' }}>
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
                  color: step.done ? 'var(--arvo-fg-soft)' : 'var(--arvo-fg-muted)',
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
                borderRadius: 8, border: '1px solid var(--arvo-fg-faint)',
                background: 'none', cursor: 'pointer',
                fontFamily: 'var(--arvo-font-body)', fontSize: 12,
                color: 'var(--arvo-fg-soft)', textAlign: 'center',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--arvo-hover-bg)')}
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
