import { useState, useEffect } from 'react'
import { useI18n } from '../contexts/I18nContext'
import { useUpgrade } from '../contexts/UpgradeContext'
import { apiFetch } from '../lib/api'
import ArvoLoader from './ArvoLoader'
import { Icon, type IconName } from './icons'

const onboardingKey = (userId: string) => `onboarding_v1_done_${userId}`

const INSTITUTION_SUGGESTIONS = [
  'Revolut', 'N26', 'Wise', 'BNP Paribas', 'Société Générale', 'Crédit Agricole',
  'LCL', 'HSBC', 'Itaú', 'Bradesco', 'Nubank', 'C6 Bank', 'Tenor Sans', 'Santander',
  'Caixa Econômica', 'Banco do Brasil', 'BTG Pactual', 'XP Investimentos',
]

// Envelopes reais do usuário (mesma fonte que a tela de Planejamento: GET
// /finances/budget). O onboarding não mais mantém uma lista hardcoded própria —
// isso causava divergência com o que o usuário via em Planejamento.
interface RealEnvelope {
  id: number
  name: string
  name_key?: string | null
  icon: string
  color: string
  pct_target: number
  type: string
}

// Fallback de nomes traduzidos por name_key, caso a env venha só com name cru.
function envLabel(env: RealEnvelope, t: any): string {
  const map: Record<string, string> = {
    envelopeEssential:    t.finances?.envelopeEssential,
    envelopeInvestment:   t.finances?.envelopeInvestment,
    envelopeSavings:      t.finances?.envelopeSavings,
    envelopeFree:         t.finances?.envelopeFree,
    envelopeIncome:       t.finances?.envelopeIncome,
    envelopeNonEssential: t.finances?.envelopeNonEssential,
    envelopeTorrar:       t.finances?.envelopeTorrar,
  }
  return (env.name_key ? map[env.name_key] : null) ?? env.name
}

interface Props {
  onDone: () => void
  userId: string
}

export default function OnboardingOverlay({ onDone, userId }: Props) {
  const { t } = useI18n()
  const { hasGate } = useUpgrade()
  const [step, setStep] = useState(0)
  const [incomeVal, setIncomeVal] = useState('')
  const [incomeCur, setIncomeCur] = useState('EUR')
  const [savingIncome, setSavingIncome] = useState(false)
  const [accountName, setAccountName] = useState('')
  const [accountCurrency, setAccountCurrency] = useState('EUR')
  const [accountInstitution, setAccountInstitution] = useState('')
  const [savingAccount, setSavingAccount] = useState(false)
  const [realEnvelopes, setRealEnvelopes] = useState<RealEnvelope[] | null>(null)

  const o = t.onboarding

  // Tiers: se o usuário não tem o gate `budget`, envelopes/orçamento estão fora
  // do plano dele — não mostramos o passo de envelopes (que terminaria num
  // paywall). Idem para as capacidades gated na tela de "o que dá pra fazer".
  const canBudget = hasGate('budget')

  const [showInstitutionSuggestions, setShowInstitutionSuggestions] = useState(false)
  const institutionSuggestions = INSTITUTION_SUGGESTIONS.filter(s =>
    accountInstitution.length === 0 || s.toLowerCase().includes(accountInstitution.toLowerCase())
  )

  // Passos dinâmicos, montados conforme o tier. Cada entrada é uma chave de
  // conteúdo; a barra de progresso e a navegação (next/back) derivam desta lista,
  // então nunca sobra um passo "vazio" ou que leve a paywall.
  const stepKeys: string[] = ['welcome', 'income', 'account']
  if (canBudget) stepKeys.push('envelopes')
  stepKeys.push('capabilities', 'done')
  const TOTAL_STEPS = stepKeys.length
  const currentKey = stepKeys[step]

  // Só busca os envelopes reais quando o passo faz parte do fluxo (tier com budget).
  useEffect(() => {
    if (!canBudget || realEnvelopes) return
    apiFetch<{ envelopes: RealEnvelope[] }>('/finances/budget')
      .then(d => setRealEnvelopes((d.envelopes ?? []).filter(e => e.type !== 'income')))
      .catch(() => setRealEnvelopes([]))
  }, [canBudget, realEnvelopes])

  function finish() {
    localStorage.setItem(onboardingKey(userId), '1')
    localStorage.setItem('arvo_onboarding_just_finished', '1')
    onDone()
  }

  function next() { setStep(s => Math.min(s + 1, TOTAL_STEPS - 1)) }
  function back() { setStep(s => Math.max(s - 1, 0)) }

  async function saveIncomeAndContinue() {
    const val = parseFloat(incomeVal)
    if (val > 0) {
      setSavingIncome(true)
      try {
        await apiFetch('/finances/income', {
          method: 'PATCH',
          body: JSON.stringify({ monthly_net: val, currency: incomeCur }),
        })
      } catch {
        // fail silently
      } finally {
        setSavingIncome(false)
      }
    }
    next()
  }

  async function createAccountAndContinue() {
    if (!accountName.trim()) { next(); return }
    setSavingAccount(true)
    try {
      await apiFetch('/finances/accounts', {
        method: 'POST',
        body: JSON.stringify({
          name: accountName.trim(),
          currency: accountCurrency,
          institution_name: accountInstitution.trim() || undefined,
          create_asset: true,
        }),
      })
    } catch {
      // fail silently
    } finally {
      setSavingAccount(false)
    }
    next()
  }

  // "O que dá pra fazer no Arvo" — adaptado ao tier. Free foca no que ele PODE
  // fazer sem esbarrar num gate; capacidades gated só aparecem para quem tem o
  // gate correspondente. Cada item usa cópia já existente do i18n quando possível.
  const capabilities: { icon: IconName; label: string; desc: string }[] = [
    { icon: 'chart-bars', label: o.capTransactions, desc: o.capTransactionsDesc },
    { icon: 'bank',       label: o.capAccounts,     desc: o.capAccountsDesc },
    { icon: 'globe',      label: o.capVoyage,       desc: o.capVoyageDesc },
    { icon: 'scissors',   label: o.capSplit,        desc: o.capSplitDesc },
    { icon: 'file',       label: o.capResources,    desc: o.capResourcesDesc },
  ]
  if (canBudget) {
    capabilities.push(
      { icon: 'chart-line', label: o.capBudget,  desc: o.capBudgetDesc },
      { icon: 'seal',       label: o.capFreedom, desc: o.capFreedomDesc },
    )
  }
  if (hasGate('shared_groups_create')) {
    capabilities.push({ icon: 'share', label: o.capShared, desc: o.capSharedDesc })
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-[var(--arvo-surface)] rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md relative flex flex-col max-h-[92vh] sm:max-h-[90vh]">

        {/* Header: progress dots + skip */}
        <div className="px-6 pt-5 pb-4 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1.5">
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === step ? 'w-6 bg-[var(--arvo-fg)]'
                    : i < step  ? 'w-2.5 bg-[var(--arvo-fg)]/40'
                    :             'w-2.5 bg-[var(--arvo-track-bg)]'
                  }`}
                />
              ))}
            </div>
            <button
              onClick={finish}
              className="text-xs text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg-muted)] transition-colors"
            >
              {o.skip}
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="px-6 pb-6 overflow-y-auto flex-1">

          {/* Welcome */}
          {currentKey === 'welcome' && (
            <div className="space-y-5 text-center">
              <div className="w-16 h-16 bg-[var(--arvo-fg)] rounded-2xl flex items-center justify-center mx-auto shadow-lg">
                <ArvoLoader size={36} style={{ color: 'var(--arvo-gold)' }} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[var(--arvo-fg)]">{o.welcomeTitle}</h2>
                <p className="text-[var(--arvo-fg-muted)] mt-2 text-sm leading-relaxed">{o.welcomeBody}</p>
              </div>
              <button
                onClick={next}
                className="w-full bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] rounded-xl py-3 text-sm font-semibold hover:bg-[var(--arvo-fg)]/90 transition-colors"
              >
                {o.start}
              </button>
            </div>
          )}

          {/* Monthly income */}
          {currentKey === 'income' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-[var(--arvo-fg)]">{o.financeIncomeTitle}</h2>
                <p className="text-[var(--arvo-fg-muted)] mt-1 text-sm leading-relaxed">{o.financeIncomeBody}</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-[var(--arvo-fg-muted)] block mb-1">{o.financeIncomeCurrency}</label>
                  <select
                    value={incomeCur}
                    onChange={e => setIncomeCur(e.target.value)}
                    className="w-full border border-[var(--arvo-border)] rounded-xl px-3 py-2.5 text-sm bg-[var(--arvo-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--arvo-fg)]/20"
                  >
                    {['EUR', 'BRL', 'USD'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--arvo-fg-muted)] block mb-1">{o.financeIncomeLabel}</label>
                  <input
                    type="number"
                    min="0"
                    value={incomeVal}
                    onChange={e => setIncomeVal(e.target.value)}
                    placeholder="3500"
                    className="w-full border border-[var(--arvo-border)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--arvo-fg)]/20"
                  />
                </div>
              </div>
              <button
                onClick={saveIncomeAndContinue}
                disabled={savingIncome}
                className="w-full bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] rounded-xl py-2.5 text-sm font-semibold hover:bg-[var(--arvo-fg)]/90 transition-colors disabled:opacity-60"
              >
                {savingIncome ? '…' : o.continue}
              </button>
              <button
                onClick={next}
                className="w-full text-xs text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg-muted)] py-1 transition-colors"
              >
                {o.financeIncomeSkip}
              </button>
            </div>
          )}

          {/* First account */}
          {currentKey === 'account' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-[var(--arvo-fg)]">{o.accountTitle}</h2>
                <p className="text-[var(--arvo-fg-muted)] mt-1 text-sm leading-relaxed">{o.accountBody}</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-[var(--arvo-fg-muted)] block mb-1">{o.accountInstitution}</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      value={accountInstitution}
                      onChange={e => { setAccountInstitution(e.target.value); setShowInstitutionSuggestions(true) }}
                      onFocus={() => setShowInstitutionSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowInstitutionSuggestions(false), 150)}
                      placeholder="Revolut"
                      autoComplete="off"
                      className="w-full border border-[var(--arvo-border)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--arvo-fg)]/20"
                    />
                    {showInstitutionSuggestions && institutionSuggestions.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 4, background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.10)', maxHeight: 180, overflowY: 'auto' }}>
                        {institutionSuggestions.map(name => (
                          <button
                            key={name}
                            type="button"
                            onPointerDown={() => { setAccountInstitution(name); setShowInstitutionSuggestions(false) }}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--arvo-fg)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--arvo-hover-bg)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--arvo-fg-muted)] block mb-1">{o.accountName}</label>
                  <input
                    type="text"
                    value={accountName}
                    onChange={e => setAccountName(e.target.value)}
                    placeholder="Revolut EUR"
                    className="w-full border border-[var(--arvo-border)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--arvo-fg)]/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--arvo-fg-muted)] block mb-1">{o.accountCurrency}</label>
                  <select
                    value={accountCurrency}
                    onChange={e => setAccountCurrency(e.target.value)}
                    className="w-full border border-[var(--arvo-border)] rounded-xl px-3 py-2.5 text-sm bg-[var(--arvo-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--arvo-fg)]/20"
                  >
                    {['EUR', 'BRL', 'USD'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <button
                onClick={createAccountAndContinue}
                disabled={!accountName.trim() || !accountInstitution.trim() || savingAccount}
                className="w-full bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] rounded-xl py-2.5 text-sm font-semibold hover:bg-[var(--arvo-fg)]/90 transition-colors disabled:opacity-60"
              >
                {savingAccount ? '…' : o.accountCreate}
              </button>
              <button
                onClick={next}
                className="w-full text-xs text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg-muted)] py-1 transition-colors"
              >
                {o.accountSkip} →
              </button>
            </div>
          )}

          {/* Envelopes reais (só tier com budget) */}
          {currentKey === 'envelopes' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-[var(--arvo-fg)]">{o.financeEnvsTitle}</h2>
                <p className="text-[var(--arvo-fg-muted)] mt-1 text-sm leading-relaxed">{o.financeEnvsBody}</p>
              </div>
              <div className="space-y-2">
                {(realEnvelopes ?? []).map(env => (
                  <div key={env.id} className="flex items-center gap-3 bg-[var(--arvo-surface-2)] border border-[var(--arvo-border)] rounded-xl px-4 py-3">
                    <span className="text-lg shrink-0 w-6 text-center">{env.icon}</span>
                    <span className="flex-1 text-sm font-medium text-[var(--arvo-fg)]">{envLabel(env, t)}</span>
                    {env.pct_target > 0 && (
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="w-16 h-1.5 bg-[var(--arvo-track-bg)] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${env.pct_target}%`, backgroundColor: env.color }} />
                        </div>
                        <span className="text-xs font-semibold text-[var(--arvo-fg-muted)] w-7 text-right">{env.pct_target}%</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={next}
                className="w-full bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] rounded-xl py-2.5 text-sm font-semibold hover:bg-[var(--arvo-fg)]/90 transition-colors"
              >
                {o.continue}
              </button>
            </div>
          )}

          {/* Capacidades — o que dá pra fazer (adaptado ao tier) */}
          {currentKey === 'capabilities' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-[var(--arvo-fg)]">{o.capabilitiesTitle}</h2>
                <p className="text-[var(--arvo-fg-muted)] mt-1 text-sm leading-relaxed">{o.capabilitiesBody}</p>
              </div>
              <div className="space-y-2">
                {capabilities.map(c => (
                  <div key={c.label} className="w-full flex items-center gap-3 bg-[var(--arvo-surface-2)] border border-[var(--arvo-border)] rounded-xl px-4 py-3">
                    <Icon name={c.icon} size={20} className="shrink-0" style={{ color: 'var(--arvo-fg-muted)' }} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--arvo-fg)]">{c.label}</p>
                      <p className="text-xs text-[var(--arvo-fg-soft)]">{c.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={next}
                className="w-full bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] rounded-xl py-2.5 text-sm font-semibold hover:bg-[var(--arvo-fg)]/90 transition-colors"
              >
                {o.continue}
              </button>
            </div>
          )}

          {/* Done — apenas fecha, sem navegação (evita rotas gated/movidas) */}
          {currentKey === 'done' && (
            <div className="space-y-5 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto" style={{ background: 'rgba(31,138,91,0.12)', border: '1px solid rgba(31,138,91,0.25)' }}>
                <Icon name="check" size={32} strokeWidth={2} style={{ color: 'var(--arvo-green)' }} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[var(--arvo-fg)]">{o.doneTitle}</h2>
                <p className="text-[var(--arvo-fg-muted)] mt-2 text-sm leading-relaxed">{o.doneBody}</p>
              </div>
              <button
                onClick={finish}
                className="w-full bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] rounded-xl py-3 text-sm font-semibold hover:bg-[var(--arvo-fg)]/90 transition-colors"
              >
                {o.doneClose}
              </button>
            </div>
          )}

          {/* Back button — todos os passos menos o primeiro e o último */}
          {step > 0 && currentKey !== 'done' && (
            <button
              onClick={back}
              className="mt-4 w-full text-xs text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg-muted)] py-1 transition-colors"
            >
              ← {o.back}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
