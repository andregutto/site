import { useState } from 'react'
import { apiFetch } from '../lib/api'
import { parseLocaleNum, inputCls } from '../lib/numparse'
import InstitutionSelect from './InstitutionSelect'
import { DatePicker } from './ui'

interface Props {
  assetId: number
  assetName: string
  assetCode: string
  investedBrl: number
  hasContributions: boolean
  onClose: () => void
  onSaved: () => void
}

const FI_TYPE_LABELS: Record<string, string> = {
  pos_cdi:   'Pos-fixado CDI',
  pre:       'Pre-fixado',
  ipca_plus: 'IPCA+',
  selic:     'Selic',
}

function rateConfig(fiType: string) {
  switch (fiType) {
    case 'pos_cdi':   return { label: 'Taxa CDI (%)',            placeholder: 'ex: 102,5', hint: '102,5 = 102,5% do CDI' }
    case 'selic':     return { label: 'Taxa Selic (%)',          placeholder: 'ex: 100',   hint: '100 = 100% da Selic' }
    case 'pre':       return { label: 'Taxa pre-fixada (% a.a.)', placeholder: 'ex: 12,5', hint: '12,5 = 12,5% ao ano' }
    case 'ipca_plus': return { label: 'Spread IPCA+ (% a.a.)',   placeholder: 'ex: 6,5',   hint: '6,5 = IPCA + 6,5% a.a.' }
    default:          return { label: 'Taxa (%)',                 placeholder: 'ex: 102,5', hint: '' }
  }
}

export default function MigrateToFIModal({ assetId, assetName, assetCode, investedBrl, hasContributions, onClose, onSaved }: Props) {
  const today = new Date().toISOString().split('T')[0]

  const [fiType,      setFiType]      = useState('pos_cdi')
  const [rate,        setRate]        = useState('')
  const [rateErr,     setRateErr]     = useState<string | undefined>()
  const [principal,   setPrincipal]   = useState(investedBrl > 0 ? String(Math.round(investedBrl * 100) / 100) : '')
  const [principalErr, setPrincipalErr] = useState<string | undefined>()
  const [startDate,   setStartDate]   = useState('')
  const [maturity,    setMaturity]    = useState('')
  const [institution, setInstitution] = useState('')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  const rateCfg = rateConfig(fiType)
  const needsRate = fiType !== 'ipca_plus'

  async function handleSave() {
    setError(null)

    const rateVal = parseLocaleNum(rate)
    if (needsRate && (rateVal === null || rateVal <= 0)) {
      setError('Informe a taxa contratada.'); return
    }
    if (!hasContributions) {
      const p = parseLocaleNum(principal)
      if (p === null || p <= 0) { setError('Informe o valor principal investido.'); return }
      if (!startDate) { setError('Informe a data de inicio.'); return }
    }

    const body: Record<string, unknown> = { fi_type: fiType }

    if (fiType === 'ipca_plus') {
      const spreadVal = parseLocaleNum(rate)
      if (spreadVal != null) body.fi_spread = spreadVal / 100
    } else if (rateVal != null) {
      body.fi_rate = rateVal / 100
    }

    if (!hasContributions) {
      const p = parseLocaleNum(principal)!
      body.fi_principal  = p
      body.fi_start_date = startDate
    }
    if (maturity)    body.fi_maturity = maturity
    if (institution) body.exchange    = institution

    setSaving(true)
    try {
      await apiFetch(`/assets/${assetId}/migrate-to-fi`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao migrar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-[var(--arvo-surface)] rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between p-5 border-b border-[var(--arvo-border)]">
          <div>
            <h2 className="font-bold text-[var(--arvo-fg)] text-base">Converter para Renda Fixa</h2>
            <p className="text-xs text-[var(--arvo-fg-soft)] mt-0.5">{assetCode} · {assetName}</p>
          </div>
          <button onClick={onClose} className="text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg-muted)] text-xl leading-none ml-4">x</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-blue-700 text-xs dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-300">
            {hasContributions
              ? 'Este ativo ja tem aportes registrados. Informe apenas os parametros do titulo e o sistema calculara automaticamente.'
              : 'Informe os parametros do titulo e o valor investido. Um aporte inicial sera criado automaticamente.'}
          </div>

          <div>
            <label className="block text-xs text-[var(--arvo-fg-muted)] mb-1">Tipo de renda fixa</label>
            <select
              value={fiType}
              onChange={e => setFiType(e.target.value)}
              className="w-full border border-[var(--arvo-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--arvo-fg)]/20 bg-[var(--arvo-surface)]"
            >
              {Object.entries(FI_TYPE_LABELS).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-[var(--arvo-fg-muted)] mb-1">{rateCfg.label}</label>
            <input
              type="text"
              inputMode="decimal"
              value={rate}
              onChange={e => { setRate(e.target.value); setRateErr(undefined) }}
              onBlur={e => {
                const raw = e.target.value.trim()
                if (raw && parseLocaleNum(raw) === null) setRateErr('Formato invalido')
              }}
              placeholder={rateCfg.placeholder}
              className={inputCls('w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2', !!rateErr)}
            />
            {rateErr
              ? <p className="text-xs text-red-500 mt-0.5 dark:text-red-400">{rateErr}</p>
              : rateCfg.hint && <p className="text-xs text-[var(--arvo-fg-soft)] mt-1">{rateCfg.hint}</p>}
          </div>

          {!hasContributions && (
            <>
              <div>
                <label className="block text-xs text-[var(--arvo-fg-muted)] mb-1">Valor investido (R$)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={principal}
                  onChange={e => { setPrincipal(e.target.value); setPrincipalErr(undefined) }}
                  onBlur={e => {
                    const raw = e.target.value.trim()
                    if (raw && parseLocaleNum(raw) === null) setPrincipalErr('Formato invalido')
                  }}
                  placeholder="ex: 50.000,00"
                  className={inputCls('w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2', !!principalErr)}
                />
                {principalErr && <p className="text-xs text-red-500 mt-0.5 dark:text-red-400">{principalErr}</p>}
              </div>

              <div>
                <label className="block text-xs text-[var(--arvo-fg-muted)] mb-1">Data de inicio</label>
                <DatePicker value={startDate} max={today} onChange={setStartDate} style={{ borderRadius: 8, padding: '8px 12px', fontSize: 14 }} />
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--arvo-fg-muted)] mb-1">Vencimento (opc.)</label>
              <DatePicker value={maturity} min={today} onChange={setMaturity} style={{ borderRadius: 8, padding: '8px 12px', fontSize: 14 }} />
            </div>
            <div>
              <label className="block text-xs text-[var(--arvo-fg-muted)] mb-1">Instituicao (opc.)</label>
              <InstitutionSelect value={institution} onChange={setInstitution} />
            </div>
          </div>

          {error && <p className="text-xs text-red-600 dark:text-red-300">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 border border-[var(--arvo-border)] text-[var(--arvo-fg-muted)] rounded-xl py-2.5 text-sm font-medium hover:bg-[var(--arvo-surface-2)] transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] rounded-xl py-2.5 text-sm font-semibold hover:bg-[var(--arvo-fg)]/90 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Convertendo...' : 'Converter para RF'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
