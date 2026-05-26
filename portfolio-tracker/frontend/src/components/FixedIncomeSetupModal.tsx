import { useState } from 'react'
import { apiFetch } from '../lib/api'
import { parseLocaleNum, inputCls } from '../lib/numparse'
import { useI18n } from '../contexts/I18nContext'
import type { PortfolioAsset } from '../lib/types'
import InstitutionSelect from './InstitutionSelect'


interface Props {
  asset: PortfolioAsset
  onClose: () => void
  onSaved: () => void
}

// Rótulo e placeholder do campo de taxa por tipo
function rateConfig(fiType: string | null | undefined) {
  switch (fiType) {
    case 'pos_cdi': return { label: 'Taxa CDI (%)',           placeholder: 'ex: 102,5',  hint: '102,5 = 102,5% do CDI' }
    case 'selic':   return { label: 'Taxa Selic (%)',         placeholder: 'ex: 100',    hint: '100 = 100% da Selic' }
    case 'pre':     return { label: 'Taxa pré-fixada (% a.a.)', placeholder: 'ex: 12,5',  hint: '12,5 = 12,5% ao ano' }
    case 'ipca_plus': return { label: 'Spread IPCA+ (% a.a.)', placeholder: 'ex: 6,5',   hint: '6,5 = IPCA + 6,5% a.a.' }
    default:          return { label: 'Taxa (%)',               placeholder: 'ex: 102,5',  hint: '' }
  }
}

// Valor inicial do campo de taxa (lê fi_rate ou fi_spread conforme tipo)
function initialRate(asset: PortfolioAsset): string {
  const type = asset.fi_type
  if (type === 'ipca_plus') {
    return asset.fi_spread != null ? String(asset.fi_spread * 100) : ''
  }
  return asset.fi_rate != null ? String(asset.fi_rate * 100) : ''
}

export default function FixedIncomeSetupModal({ asset, onClose, onSaved }: Props) {
  const today = new Date().toISOString().split('T')[0]
  const { t } = useI18n()

  const [fiType,      setFiType]      = useState(asset.fi_type ?? 'pos_cdi')
  const [principal,   setPrincipal]   = useState('')
  const [principalErr, setPrincipalErr] = useState<string | undefined>()
  const [startDate,   setStartDate]   = useState(asset.fi_start_date ?? '')
  const [rate,        setRate]        = useState(initialRate(asset))
  const [rateErr,     setRateErr]     = useState<string | undefined>()
  const [maturity,    setMaturity]    = useState(asset.fi_maturity ?? '')
  const [institution, setInstitution] = useState(asset.exchange ?? '')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  // Portability
  const [showPortability,   setShowPortability]   = useState(false)
  const [portInstitution,   setPortInstitution]   = useState('')
  const [portDate,          setPortDate]          = useState(new Date().toISOString().split('T')[0])
  const [savingPortability, setSavingPortability] = useState(false)
  const [portError,         setPortError]         = useState<string | null>(null)

  const rateCfg  = rateConfig(fiType)
  const needsRate = true

  const FI_TYPE_OPTIONS_LOCAL = [
    { value: 'pos_cdi',   label: t.contributions.fiPosFixed },
    { value: 'selic',     label: t.contributions.fiSelic    },
    { value: 'pre',       label: t.contributions.fiPreFixed },
    { value: 'ipca_plus', label: t.contributions.fiIpcaPlus },
  ]

  async function handleSave() {
    const p = parseLocaleNum(principal)
    if (p === null || p <= 0) { setError(t.modals.errorPrincipal); return }
    if (!startDate)           { setError(t.modals.errorStartDate); return }

    const rateVal = parseLocaleNum(rate)
    if (needsRate && (rateVal === null || rateVal <= 0)) {
      setError(t.modals.errorRate); return
    }

    setSaving(true)
    setError(null)
    try {
      const patch: Record<string, unknown> = {
        fi_principal: p,
        fi_start_date: startDate,
        fi_type: fiType,
      }

      if (rateVal !== null && rateVal > 0) {
        if (fiType === 'ipca_plus') {
          patch.fi_spread = rateVal / 100
          patch.fi_rate   = null
        } else {
          patch.fi_rate   = rateVal / 100
          patch.fi_spread = null
        }
      }

      if (maturity) patch.fi_maturity  = maturity
      if (institution) patch.exchange  = institution

      await apiFetch(`/assets/${asset.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : t.modals.errorSave)
    } finally {
      setSaving(false)
    }
  }

  async function handlePortability() {
    if (!portInstitution.trim()) { setPortError(t.modals.errorInstitution); return }
    setSavingPortability(true); setPortError(null)
    try {
      await apiFetch(`/assets/${asset.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ exchange: portInstitution.trim() }),
      })
      setShowPortability(false)
      setPortInstitution('')
      onSaved()
    } catch (e) {
      setPortError(e instanceof Error ? e.message : t.modals.errorPortability)
    } finally {
      setSavingPortability(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900 text-base">{asset.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{asset.code} · {asset.class_name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4">×</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-700 text-xs">
            {t.modals.fiHint}
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t.modals.fiType}</label>
            <select
              value={fiType}
              onChange={e => setFiType(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D0D0D]/20 bg-white"
            >
              {FI_TYPE_OPTIONS_LOCAL.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Principal */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t.modals.investedBrl}</label>
            <input
              type="text"
              inputMode="decimal"
              value={principal}
              onChange={e => { setPrincipal(e.target.value); setPrincipalErr(undefined) }}
              onBlur={e => {
                const raw = e.target.value.trim()
                if (raw && parseLocaleNum(raw) === null) setPrincipalErr(t.modals.invalidFormat)
              }}
              placeholder="ex: 50.000,00"
              className={inputCls('w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2', !!principalErr)}
            />
            {principalErr && <p className="text-xs text-red-500 mt-0.5">{principalErr}</p>}
          </div>

          {/* Taxa contratada */}
          {needsRate && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">{rateCfg.label}</label>
              <input
                type="text"
                inputMode="decimal"
                value={rate}
                onChange={e => { setRate(e.target.value); setRateErr(undefined) }}
                onBlur={e => {
                  const raw = e.target.value.trim()
                  if (raw && parseLocaleNum(raw) === null) setRateErr(t.modals.invalidFormat)
                }}
                placeholder={rateCfg.placeholder}
                className={inputCls('w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2', !!rateErr)}
              />
              {rateErr
                ? <p className="text-xs text-red-500 mt-0.5">{rateErr}</p>
                : rateCfg.hint && <p className="text-xs text-gray-400 mt-1">{rateCfg.hint}</p>
              }
            </div>
          )}

          {/* Datas em linha */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t.modals.startDate}</label>
              <input
                type="date"
                value={startDate}
                max={today}
                onChange={e => setStartDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D0D0D]/20"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t.modals.maturityOpt}</label>
              <input
                type="date"
                value={maturity}
                min={today}
                onChange={e => setMaturity(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D0D0D]/20"
              />
            </div>
          </div>

          {/* Instituição */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t.modals.institution}</label>
            <InstitutionSelect
              value={institution}
              onChange={setInstitution}
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              {t.common.cancel}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-[#0D0D0D] text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-[#0D0D0D]/90 disabled:opacity-50 transition-colors"
            >
              {saving ? t.modals.saving : t.modals.saveAndCalculate}
            </button>
          </div>

          {/* Portabilidade */}
          <div className="border-t border-gray-100 pt-4 mt-2">
            <button
              type="button"
              onClick={() => { setShowPortability(v => !v); setPortError(null) }}
              className="text-xs text-[#0D0D0D] hover:underline font-medium"
            >
              {showPortability ? t.modals.portabilityClose : t.modals.portabilityOpen}
            </button>

            {showPortability && (
              <div className="mt-3 space-y-3">
                <p className="text-xs text-gray-500">
                  {t.modals.portabilityDesc}
                </p>
                {asset.exchange && (
                  <p className="text-xs text-gray-400">{t.modals.currentCustodian} <span className="font-medium text-gray-700">{asset.exchange}</span></p>
                )}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t.modals.newInstitution}</label>
                  <InstitutionSelect value={portInstitution} onChange={setPortInstitution} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t.modals.portDate}</label>
                  <input
                    type="date"
                    value={portDate}
                    max={new Date().toISOString().split('T')[0]}
                    onChange={e => setPortDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D0D0D]/20"
                  />
                </div>
                {portError && <p className="text-xs text-red-600">{portError}</p>}
                <button
                  onClick={handlePortability}
                  disabled={savingPortability}
                  className="w-full border border-[#0D0D0D] text-[#0D0D0D] rounded-xl py-2 text-sm font-semibold hover:bg-[#0D0D0D]/5 disabled:opacity-50 transition-colors"
                >
                  {savingPortability ? t.modals.registering : t.modals.confirmPortability}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
