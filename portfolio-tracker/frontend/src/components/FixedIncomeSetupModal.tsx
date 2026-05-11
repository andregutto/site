import { useState } from 'react'
import { apiFetch } from '../lib/api'
import type { PortfolioAsset } from '../lib/types'
import InstitutionSelect from './InstitutionSelect'

interface Props {
  asset: PortfolioAsset
  onClose: () => void
  onSaved: () => void
}

const FI_TYPE_LABELS: Record<string, string> = {
  pos_cdi:   'Pós-fixado CDI',
  pre:       'Pré-fixado',
  ipca_plus: 'IPCA+',
  selic:     'Selic',
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

  const [fiType,      setFiType]      = useState(asset.fi_type ?? 'pos_cdi')
  const [principal,   setPrincipal]   = useState('')
  const [startDate,   setStartDate]   = useState(asset.fi_start_date ?? '')
  const [rate,        setRate]        = useState(initialRate(asset))
  const [maturity,    setMaturity]    = useState(asset.fi_maturity ?? '')
  const [institution, setInstitution] = useState(asset.exchange ?? '')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  const rateCfg  = rateConfig(fiType)
  const needsRate = true

  async function handleSave() {
    const p = parseFloat(principal.replace(/\./g, '').replace(',', '.'))
    if (isNaN(p) || p <= 0) { setError('Informe o valor principal investido.'); return }
    if (!startDate)          { setError('Informe a data de início.'); return }

    const rateVal = parseFloat(rate.replace(',', '.'))
    if (needsRate && (isNaN(rateVal) || rateVal <= 0)) {
      setError('Informe a taxa contratada.'); return
    }

    setSaving(true)
    setError(null)
    try {
      const patch: Record<string, unknown> = {
        fi_principal: p,
        fi_start_date: startDate,
        fi_type: fiType,
      }

      if (!isNaN(rateVal) && rateVal > 0) {
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
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
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
            Informe os dados do título para o sistema calcular o rendimento automaticamente via{' '}
            {fiType === 'ipca_plus' ? 'IPCA do Banco Central' : fiType === 'pre' ? 'taxa pré-fixada' : 'CDI do Banco Central'}.
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tipo de renda fixa</label>
            <select
              value={fiType}
              onChange={e => setFiType(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20 bg-white"
            >
              {Object.entries(FI_TYPE_LABELS).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </div>

          {/* Principal */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Valor investido (R$)</label>
            <input
              type="text"
              inputMode="decimal"
              value={principal}
              onChange={e => setPrincipal(e.target.value)}
              placeholder="ex: 50.000,00"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
            />
          </div>

          {/* Taxa contratada */}
          {needsRate && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">{rateCfg.label}</label>
              <input
                type="text"
                inputMode="decimal"
                value={rate}
                onChange={e => setRate(e.target.value)}
                placeholder={rateCfg.placeholder}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
              />
              {rateCfg.hint && <p className="text-xs text-gray-400 mt-1">{rateCfg.hint}</p>}
            </div>
          )}

          {/* Datas em linha */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Data de início</label>
              <input
                type="date"
                value={startDate}
                max={today}
                onChange={e => setStartDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Vencimento (opc.)</label>
              <input
                type="date"
                value={maturity}
                min={today}
                onChange={e => setMaturity(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
              />
            </div>
          </div>

          {/* Instituição */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Instituição financeira</label>
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
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-[#001A70] text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-[#001A70]/90 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Salvando...' : 'Salvar e calcular'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
