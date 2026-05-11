import { useState, useEffect } from 'react'
import { useContributions } from '../hooks/usePortfolio'
import { useCurrency } from '../contexts/CurrencyContext'
import { apiFetch } from '../lib/api'
import type { PortfolioAsset } from '../lib/types'

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')
}

function fmtNum(v: number, d = 4) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: d }).format(v)
}

interface AssetOption { id: number; code: string; name: string; currency: string; asset_type: string }

export default function ContributionsPage() {
  const { data: contributions, loading, error, refresh } = useContributions()
  const { fmt } = useCurrency()

  const [assets, setAssets]         = useState<AssetOption[]>([])
  const [showForm, setShowForm]      = useState(false)
  const [saving, setSaving]          = useState(false)
  const [formErr, setFormErr]        = useState<string | null>(null)

  // Form fields
  const [assetId, setAssetId]        = useState('')
  const [date, setDate]              = useState(new Date().toISOString().split('T')[0])
  const [type, setType]              = useState<'buy' | 'sell'>('buy')
  const [quantity, setQuantity]      = useState('')
  const [priceOrig, setPriceOrig]    = useState('')
  const [valueBrl, setValueBrl]      = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    // Busca lista de ativos para o selector
    apiFetch<{ by_asset: PortfolioAsset[] }>('/portfolio/value')
      .then(d => setAssets(
        d.by_asset.map(a => ({ id: a.id, code: a.code, name: a.name, currency: 'BRL', asset_type: '' }))
      ))
      .catch(() => {})
  }, [])

  const selectedAsset = assets.find(a => a.id === Number(assetId))

  async function handleSave() {
    if (!assetId) { setFormErr('Selecione um ativo.'); return }
    const qty = parseFloat(quantity.replace(',', '.'))
    if (!qty || qty <= 0) { setFormErr('Informe uma quantidade válida.'); return }
    if (!date) { setFormErr('Informe a data.'); return }
    setSaving(true)
    setFormErr(null)
    try {
      await apiFetch('/contributions', {
        method: 'POST',
        body: JSON.stringify({
          asset_id:    Number(assetId),
          date,
          type,
          quantity:    qty,
          price_orig:  priceOrig  ? parseFloat(priceOrig.replace(',', '.'))  : undefined,
          value_brl:   valueBrl   ? parseFloat(valueBrl.replace(',', '.'))   : undefined,
          currency:    selectedAsset?.currency ?? 'BRL',
          description: description || undefined,
        }),
      })
      setShowForm(false)
      setAssetId(''); setQuantity(''); setPriceOrig(''); setValueBrl(''); setDescription('')
      refresh()
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Remover este aporte?')) return
    try {
      await apiFetch(`/contributions/${id}`, { method: 'DELETE' })
      refresh()
    } catch { /* ignore */ }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Aportes</h1>
        <button
          onClick={() => setShowForm(f => !f)}
          className="px-4 py-2 bg-[#001A70] text-white text-sm font-semibold rounded-xl hover:bg-[#001A70]/90 transition-colors"
        >
          {showForm ? 'Cancelar' : '+ Novo aporte'}
        </button>
      </div>

      {/* Formulário */}
      {showForm && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-800">Registrar aporte / resgate</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Ativo */}
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Ativo</label>
              <select
                value={assetId}
                onChange={e => setAssetId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
              >
                <option value="">Selecione...</option>
                {assets.map(a => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </div>

            {/* Data + Tipo */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Data</label>
              <input
                type="date"
                value={date}
                max={new Date().toISOString().split('T')[0]}
                onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tipo</label>
              <div className="flex gap-2">
                {(['buy', 'sell'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      type === t
                        ? t === 'buy'
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-red-600 text-white border-red-600'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {t === 'buy' ? 'Compra' : 'Venda'}
                  </button>
                ))}
              </div>
            </div>

            {/* Quantidade + Preço */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Quantidade</label>
              <input
                type="text"
                inputMode="decimal"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                placeholder="0,00"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Preço unitário {selectedAsset ? `(${selectedAsset.currency})` : ''}
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={priceOrig}
                onChange={e => setPriceOrig(e.target.value)}
                placeholder="opcional"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
              />
            </div>

            {/* Valor total em BRL */}
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Valor total em BRL</label>
              <input
                type="text"
                inputMode="decimal"
                value={valueBrl}
                onChange={e => setValueBrl(e.target.value)}
                placeholder="0,00"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
              />
            </div>

            {/* Descrição */}
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Descrição (opcional)</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="ex: compra na corretora XP"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
              />
            </div>
          </div>

          {formErr && <p className="text-xs text-red-600">{formErr}</p>}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-[#001A70] text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-[#001A70]/90 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Salvando...' : 'Registrar'}
          </button>
        </div>
      )}

      {/* Tabela de aportes */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">
            Histórico{contributions.length > 0 ? ` (${contributions.length})` : ''}
          </h2>
        </div>

        {loading ? (
          <p className="text-center text-gray-400 py-8 text-sm animate-pulse">Carregando...</p>
        ) : error ? (
          <p className="text-center text-red-500 py-8 text-sm">{error}</p>
        ) : contributions.length === 0 ? (
          <p className="text-center text-gray-400 py-8 text-sm">Nenhum aporte registrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Data</th>
                  <th className="px-4 py-3 text-left">Ativo</th>
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-right">Qtd</th>
                  <th className="px-4 py-3 text-right">Total BRL</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {contributions.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(c.date)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {c.assets.asset_classes && (
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: c.assets.asset_classes.color }}
                          />
                        )}
                        <span className="font-medium text-gray-900">{c.assets.code}</span>
                        <span className="text-gray-400 text-xs hidden sm:inline truncate max-w-[120px]">
                          {c.assets.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        c.type === 'buy'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {c.type === 'buy' ? 'Compra' : 'Venda'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {fmtNum(c.quantity, 6)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {c.value_brl != null ? fmt(c.value_brl) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors text-sm"
                        title="Remover"
                      >×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
