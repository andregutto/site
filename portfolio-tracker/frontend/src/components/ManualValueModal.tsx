import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import type { PortfolioAsset, ManualValue } from '../lib/types'

interface Props {
  asset: PortfolioAsset
  onClose: () => void
  onSaved: () => void
}

const CURRENCIES = ['BRL', 'USD', 'EUR', 'GBP']

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')
}

function fmtVal(v: number, cur: string) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: cur, maximumFractionDigits: 2,
  }).format(v)
}

export default function ManualValueModal({ asset, onClose, onSaved }: Props) {
  const today = new Date().toISOString().split('T')[0]

  const [history, setHistory]   = useState<ManualValue[]>([])
  const [loadingH, setLoadingH] = useState(true)

  const [refDate, setRefDate]   = useState(today)
  const [value, setValue]       = useState('')
  const [currency, setCurrency] = useState(asset.currency || 'BRL')
  const [notes, setNotes]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    apiFetch<ManualValue[]>(`/assets/${asset.id}/manual-values`)
      .then(setHistory)
      .catch(() => {})
      .finally(() => setLoadingH(false))
  }, [asset.id])

  async function handleSave() {
    const v = parseFloat(value.replace(',', '.'))
    if (isNaN(v) || v <= 0) { setError('Informe um valor válido maior que zero.'); return }
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/assets/${asset.id}/manual-value`, {
        method: 'POST',
        body: JSON.stringify({ ref_date: refDate, value: v, currency, notes: notes || undefined }),
      })
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(valueId: number) {
    if (!confirm('Remover esta entrada?')) return
    try {
      await apiFetch(`/assets/${asset.id}/manual-value/${valueId}`, { method: 'DELETE' })
      setHistory(h => h.filter(v => v.id !== valueId))
    } catch { /* ignore */ }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900 text-base">{asset.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{asset.code} · {asset.class_name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4">×</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {/* Formulário */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Registrar valor atual</h3>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Data de referência</label>
                <input
                  type="date"
                  value={refDate}
                  max={today}
                  onChange={e => setRefDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Moeda</label>
                <select
                  value={currency}
                  onChange={e => setCurrency(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
                >
                  {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Valor atual ({currency})</label>
              <input
                type="text"
                inputMode="decimal"
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder="0,00"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Notas (opcional)</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="ex: saldo em 01/05/2026"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
              />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-[#001A70] text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-[#001A70]/90 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Salvando...' : 'Salvar valor'}
            </button>
          </div>

          {/* Histórico */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Histórico</h3>
            {loadingH ? (
              <p className="text-xs text-gray-400 animate-pulse">Carregando...</p>
            ) : history.length === 0 ? (
              <p className="text-xs text-gray-400">Nenhum valor registrado ainda.</p>
            ) : (
              <div className="space-y-1">
                {history.map(h => (
                  <div key={h.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <div>
                      <span className="text-sm font-medium text-gray-900">{fmtVal(h.value, h.currency)}</span>
                      <span className="text-xs text-gray-400 ml-2">{fmtDate(h.ref_date)}</span>
                      {h.notes && <span className="text-xs text-gray-400 ml-2 italic">{h.notes}</span>}
                    </div>
                    <button
                      onClick={() => handleDelete(h.id)}
                      className="text-gray-300 hover:text-red-500 text-sm ml-2 transition-colors"
                      title="Remover"
                    >×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
