import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../contexts/I18nContext'
import { apiFetch } from '../lib/api'

const onboardingKey = (userId: string) => `onboarding_v1_done_${userId}`

const INSTITUTION_SUGGESTIONS = [
  'Revolut', 'N26', 'Wise', 'BNP Paribas', 'Société Générale', 'Crédit Agricole',
  'LCL', 'HSBC', 'Itaú', 'Bradesco', 'Nubank', 'C6 Bank', 'Inter', 'Santander',
  'Caixa Econômica', 'Banco do Brasil', 'BTG Pactual', 'XP Investimentos',
]

const CLASSES_BY_LOCALE: Record<string, { name: string; color: string; nameKey: string }[]> = {
  pt: [
    { name: 'Ações Brasil',   color: '#10b981', nameKey: 'classAcoesBrasil' },
    { name: 'Ações Exterior', color: '#3b82f6', nameKey: 'classAcoesExterior' },
    { name: 'FIIs',           color: '#f59e0b', nameKey: 'classFiis' },
    { name: 'Cripto',         color: '#f97316', nameKey: 'classCripto' },
    { name: 'Renda Fixa',     color: '#06b6d4', nameKey: 'classRendaFixa' },
    { name: 'Previdência',    color: '#8b5cf6', nameKey: 'classPrevidencia' },
    { name: 'Imóveis',        color: '#ef4444', nameKey: 'classImoveis' },
  ],
  en: [
    { name: 'Brazilian Stocks',     color: '#10b981', nameKey: 'classAcoesBrasil' },
    { name: 'International Stocks', color: '#3b82f6', nameKey: 'classAcoesExterior' },
    { name: 'REITs',                color: '#f59e0b', nameKey: 'classFiis' },
    { name: 'Crypto',               color: '#f97316', nameKey: 'classCripto' },
    { name: 'Fixed Income',         color: '#06b6d4', nameKey: 'classRendaFixa' },
    { name: 'Pension',              color: '#8b5cf6', nameKey: 'classPrevidencia' },
    { name: 'Real Estate',          color: '#ef4444', nameKey: 'classImoveis' },
  ],
  fr: [
    { name: 'Actions brésiliennes', color: '#10b981', nameKey: 'classAcoesBrasil' },
    { name: 'Actions mondiales',    color: '#3b82f6', nameKey: 'classAcoesExterior' },
    { name: 'ETF / SCPI',           color: '#f59e0b', nameKey: 'classFiis' },
    { name: 'Crypto',               color: '#f97316', nameKey: 'classCripto' },
    { name: 'Revenu fixe',          color: '#06b6d4', nameKey: 'classRendaFixa' },
    { name: 'Épargne retraite',     color: '#8b5cf6', nameKey: 'classPrevidencia' },
    { name: 'Immobilier',           color: '#ef4444', nameKey: 'classImoveis' },
  ],
}

const ENVELOPES_BY_LOCALE: Record<string, { name: string; icon: string; color: string; pct: number }[]> = {
  pt: [
    { name: 'Gastos Essenciais', icon: '🏠', color: '#3b82f6', pct: 50 },
    { name: 'Investimentos',     icon: '📈', color: '#10b981', pct: 30 },
    { name: 'Reserva',           icon: '🏦', color: '#f59e0b', pct: 10 },
    { name: 'Lazer',             icon: '🎉', color: '#a855f7', pct: 10 },
  ],
  en: [
    { name: 'Essential Expenses', icon: '🏠', color: '#3b82f6', pct: 50 },
    { name: 'Investments',        icon: '📈', color: '#10b981', pct: 30 },
    { name: 'Savings',            icon: '🏦', color: '#f59e0b', pct: 10 },
    { name: 'Fun Money',          icon: '🎉', color: '#a855f7', pct: 10 },
  ],
  fr: [
    { name: 'Dépenses Essentielles', icon: '🏠', color: '#3b82f6', pct: 50 },
    { name: 'Investissements',       icon: '📈', color: '#10b981', pct: 30 },
    { name: 'Épargne',               icon: '🏦', color: '#f59e0b', pct: 10 },
    { name: 'Loisirs',               icon: '🎉', color: '#a855f7', pct: 10 },
  ],
}

interface Props {
  onDone: () => void
  userId: string
}

export default function OnboardingOverlay({ onDone, userId }: Props) {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [incomeVal, setIncomeVal] = useState('')
  const [incomeCur, setIncomeCur] = useState('EUR')
  const [savingIncome, setSavingIncome] = useState(false)
  const [accountName, setAccountName] = useState('')
  const [accountCurrency, setAccountCurrency] = useState('EUR')
  const [accountInstitution, setAccountInstitution] = useState('')
  const [savingAccount, setSavingAccount] = useState(false)
  const [accountCreated, setAccountCreated] = useState(false)

  const o = t.onboarding
  const TOTAL_STEPS = 7
  const defaultClasses   = CLASSES_BY_LOCALE[locale]   ?? CLASSES_BY_LOCALE.pt
  const defaultEnvelopes = ENVELOPES_BY_LOCALE[locale] ?? ENVELOPES_BY_LOCALE.pt

  function finish() {
    localStorage.setItem(onboardingKey(userId), '1')
    onDone()
  }

  function goToDashboard() { finish(); navigate('/') }
  function goToFinances()   { finish(); navigate('/finances') }
  function goToInstitutions() { finish(); navigate('/institutions') }
  function goToAccounts()   { finish(); navigate('/finances/accounts') }

  function createClassesAndContinue() {
    // Classes are created by the DB trigger at signup (handle_new_user).
    // This step is now informational only.
    setStep(2)
  }

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
    setStep(3)
  }

  async function createAccountAndContinue() {
    if (!accountName.trim()) { setStep(4); return }
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
      setAccountCreated(true)
    } catch {
      // fail silently
    } finally {
      setSavingAccount(false)
    }
    setStep(4)
  }

  // Step layout:
  // 0 Welcome → 1 Classes → 2 Income → 3 Account → 4 Asset Types (info) → 5 Envelopes → 6 Done

  const ASSET_TYPES = [
    { icon: '💰',  label: o.assetCash,   desc: o.assetCashDesc   },
    { icon: '🇧🇷', label: o.assetB3,     desc: o.assetB3Desc     },
    { icon: '🌎',  label: o.assetIntl,   desc: o.assetIntlDesc   },
    { icon: '₿',   label: o.assetCrypto, desc: o.assetCryptoDesc },
    { icon: '📄',  label: o.assetFi,     desc: o.assetFiDesc     },
    { icon: '🏠',  label: o.assetImovel, desc: o.assetImovelDesc },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative flex flex-col max-h-[90vh]">

        {/* Header: progress dots + skip */}
        <div className="px-6 pt-5 pb-4 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1.5">
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === step ? 'w-6 bg-[#001A70]'
                    : i < step  ? 'w-2.5 bg-[#001A70]/40'
                    :             'w-2.5 bg-gray-200'
                  }`}
                />
              ))}
            </div>
            <button
              onClick={finish}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              {o.skip}
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="px-6 pb-6 overflow-y-auto flex-1">

          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="space-y-5 text-center">
              <div className="w-16 h-16 bg-[#001A70] rounded-2xl flex items-center justify-center mx-auto shadow-lg">
                <span className="text-white text-3xl">▦</span>
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#001A70]">{o.welcomeTitle}</h2>
                <p className="text-gray-500 mt-2 text-sm leading-relaxed">{o.welcomeBody}</p>
              </div>
              <button
                onClick={() => setStep(1)}
                className="w-full bg-[#001A70] text-white rounded-xl py-3 text-sm font-semibold hover:bg-[#001A70]/90 transition-colors"
              >
                {o.start}
              </button>
            </div>
          )}

          {/* Step 1: Default asset classes */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{o.classesTitle}</h2>
                <p className="text-gray-500 mt-1 text-sm leading-relaxed">{o.classesBody}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {defaultClasses.map(c => (
                  <div key={c.nameKey} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                    <span className="text-sm font-medium text-gray-700">{c.name}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">{o.classesNote}</p>
              <button
                onClick={createClassesAndContinue}
                className="w-full bg-[#001A70] text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-[#001A70]/90 transition-colors"
              >
                {o.continue}
              </button>
            </div>
          )}

          {/* Step 2: Monthly income */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{o.financeIncomeTitle}</h2>
                <p className="text-gray-500 mt-1 text-sm leading-relaxed">{o.financeIncomeBody}</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">{o.financeIncomeCurrency}</label>
                  <select
                    value={incomeCur}
                    onChange={e => setIncomeCur(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
                  >
                    {['EUR', 'BRL', 'USD'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">{o.financeIncomeLabel}</label>
                  <input
                    type="number"
                    min="0"
                    value={incomeVal}
                    onChange={e => setIncomeVal(e.target.value)}
                    placeholder="3500"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
                  />
                </div>
              </div>
              <button
                onClick={saveIncomeAndContinue}
                disabled={savingIncome}
                className="w-full bg-[#001A70] text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-[#001A70]/90 transition-colors disabled:opacity-60"
              >
                {savingIncome ? '…' : o.continue}
              </button>
              <button
                onClick={() => setStep(3)}
                className="w-full text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors"
              >
                {o.financeIncomeSkip}
              </button>
            </div>
          )}

          {/* Step 3: First account */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{o.accountTitle}</h2>
                <p className="text-gray-500 mt-1 text-sm leading-relaxed">{o.accountBody}</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">{o.accountInstitution}</label>
                  <input
                    type="text"
                    list="institution-suggestions"
                    value={accountInstitution}
                    onChange={e => setAccountInstitution(e.target.value)}
                    placeholder="Revolut"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
                  />
                  <datalist id="institution-suggestions">
                    {INSTITUTION_SUGGESTIONS.map(s => <option key={s} value={s} />)}
                  </datalist>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">{o.accountName}</label>
                  <input
                    type="text"
                    value={accountName}
                    onChange={e => setAccountName(e.target.value)}
                    placeholder="Revolut EUR"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">{o.accountCurrency}</label>
                  <select
                    value={accountCurrency}
                    onChange={e => setAccountCurrency(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
                  >
                    {['EUR', 'BRL', 'USD'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <button
                onClick={createAccountAndContinue}
                disabled={!accountName.trim() || !accountInstitution.trim() || savingAccount}
                className="w-full bg-[#001A70] text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-[#001A70]/90 transition-colors disabled:opacity-60"
              >
                {savingAccount ? '…' : o.accountCreate}
              </button>
              <button
                onClick={() => setStep(4)}
                className="w-full text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors"
              >
                {o.accountSkip} →
              </button>
            </div>
          )}

          {/* Step 4: Asset types — informational only */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{o.assetsTitle}</h2>
                <p className="text-gray-500 mt-1 text-sm">{o.assetsBody}</p>
              </div>
              <div className="space-y-2">
                {ASSET_TYPES.map(a => (
                  <div
                    key={a.label}
                    className="w-full flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3"
                  >
                    <span className="text-xl shrink-0">{a.icon}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{a.label}</p>
                      <p className="text-xs text-gray-400 truncate">{a.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setStep(5)}
                className="w-full bg-[#001A70] text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-[#001A70]/90 transition-colors"
              >
                {o.continue}
              </button>
            </div>
          )}

          {/* Step 5: Default envelopes */}
          {step === 5 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{o.financeEnvsTitle}</h2>
                <p className="text-gray-500 mt-1 text-sm leading-relaxed">{o.financeEnvsBody}</p>
              </div>
              <div className="space-y-2">
                {defaultEnvelopes.map(env => (
                  <div key={env.name} className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                    <span className="text-xl shrink-0">{env.icon}</span>
                    <span className="flex-1 text-sm font-medium text-gray-700">{env.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${env.pct}%`, backgroundColor: env.color }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-gray-500 w-7 text-right">{env.pct}%</span>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setStep(6)}
                className="w-full bg-[#001A70] text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-[#001A70]/90 transition-colors"
              >
                {o.continue}
              </button>
            </div>
          )}

          {/* Step 6: Done */}
          {step === 6 && (
            <div className="space-y-5 text-center">
              <div className="w-16 h-16 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center mx-auto">
                <span className="text-3xl">✅</span>
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">{o.doneTitle}</h2>
                <p className="text-gray-500 mt-2 text-sm leading-relaxed">{o.doneBody}</p>
              </div>
              <div className="space-y-2">
                <button
                  onClick={goToDashboard}
                  className="w-full bg-[#001A70] text-white rounded-xl py-3 text-sm font-semibold hover:bg-[#001A70]/90 transition-colors"
                >
                  {o.gotoDashboard}
                </button>
                {accountCreated ? (
                  <button
                    onClick={goToAccounts}
                    className="w-full border border-[#001A70]/20 text-[#001A70] rounded-xl py-3 text-sm font-semibold hover:bg-[#001A70]/5 transition-colors"
                  >
                    {o.gotoAccounts}
                  </button>
                ) : (
                  <button
                    onClick={goToInstitutions}
                    className="w-full border border-[#001A70]/20 text-[#001A70] rounded-xl py-3 text-sm font-semibold hover:bg-[#001A70]/5 transition-colors"
                  >
                    {o.gotoInstitutions}
                  </button>
                )}
                <button
                  onClick={goToFinances}
                  className="w-full text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors"
                >
                  {o.gotoFinances}
                </button>
              </div>
            </div>
          )}

          {/* Back button for steps 1–5 */}
          {step > 0 && step < 6 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="mt-4 w-full text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors"
            >
              ← {o.back}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
