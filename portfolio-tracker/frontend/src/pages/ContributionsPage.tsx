import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useContributions } from '../hooks/usePortfolio'
import { useCurrency } from '../contexts/CurrencyContext'
import { apiFetch } from '../lib/api'

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')
}

function fmtNum(v: number, d = 4) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: d }).format(v)
}

interface AssetOption {
  id: number
  code: string
  name: string
  asset_type: string
  currency: string
  asset_classes: { id: number; name: string; color: string } | null
}

interface AssetClass { id: number; name: string; color: string }

const CURRENCIES = ['BRL', 'USD', 'EUR', 'GBP', 'CHF']

const ASSET_TYPES = [
  { value: 'ticker',       label: 'Ativo (ação / ETF / cripto)' },
  { value: 'fixed_income', label: 'Renda fixa' },
  { value: 'manual',       label: 'Valor manual' },
]

function parseNum(s: string): number | null {
  const v = parseFloat(s.replace(/\./g, '').replace(',', '.'))
  return isNaN(v) ? null : v
}

export default function ContributionsPage() {
  const { data: contributions, loading, error, refresh } = useContributions()
  const { fmt, fxRates } = useCurrency()
  const [searchParams, setSearchParams] = useSearchParams()

  const [assets,  setAssets]  = useState<AssetOption[]>([])
  const [classes, setClasses] = useState<AssetClass[]>([])

  const [showForm,     setShowForm]     = useState(false)
  const [showNewAsset, setShowNewAsset] = useState(false)
  const [saving,          setSaving]          = useState(false)
  const [savingNewAsset,  setSavingNewAsset]  = useState(false)
  const [formErr,         setFormErr]         = useState<string | null>(null)
  const [newAssetErr,     setNewAssetErr]     = useState<string | null>(null)
  const [assetSearch,     setAssetSearch]     = useState('')

  // contribution form fields
  const [assetId,      setAssetId]      = useState('')
  const [date,         setDate]         = useState(new Date().toISOString().split('T')[0])
  const [type,         setType]         = useState<'buy' | 'sell'>('buy')
  const [quantity,     setQuantity]     = useState('')
  const [priceOrig,    setPriceOrig]    = useState('')
  const [priceCurrency, setPriceCurrency] = useState('BRL')
  const [valueBrl,     setValueBrl]     = useState('')
  const [description,  setDescription]  = useState('')

  // new asset form fields
  const [newCode,      setNewCode]      = useState('')
  const [newName,      setNewName]      = useState('')
  const [newAssetType, setNewAssetType] = useState('ticker')
  const [newCurrency,  setNewCurrency]  = useState('BRL')
  const [newClassId,   setNewClassId]   = useState('')

  const loadAssets = useCallback(async () => {
    try {
      const [assetData, classData] = await Promise.all([
        apiFetch<AssetOption[]>('/assets'),
        apiFetch<AssetClass[]>('/assets/classes'),
      ])
      setAssets(assetData)
      setClasses(classData)
    } catch { /* silent */ }
  }, [])

  useEffect(() => { loadAssets() }, [loadAssets])

  // URL param: open form pre-filled with a specific asset
  useEffect(() => {
    const paramId = searchParams.get('assetId')
    const isNew   = searchParams.get('new') === '1'
    if (paramId) {
      setAssetId(paramId)
      if (isNew) setShowForm(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const selectedAsset = assets.find(a => a.id === Number(assetId))

  // When asset changes, set priceCurrency to the asset's native currency
  useEffect(() => {
    if (selectedAsset) setPriceCurrency(selectedAsset.currency)
  }, [assetId, selectedAsset])

  // Auto-compute value_brl from qty × price × fx when all three are known
  useEffect(() => {
    const qty   = parseNum(quantity)
    const price = parseNum(priceOrig)
    if (!qty || !price) return
    if (priceCurrency === 'BRL') {
      setValueBrl((qty * price).toFixed(2).replace('.', ','))
    } else {
      const rate = (fxRates as Record<string, number>)[priceCurrency]
      if (rate) setValueBrl((qty * price * rate).toFixed(2).replace('.', ','))
    }
  }, [quantity, priceOrig, priceCurrency, fxRates])

  const filteredAssets = assets.filter(a =>
    a.code.toLowerCase().includes(assetSearch.toLowerCase()) ||
    a.name.toLowerCase().includes(assetSearch.toLowerCase())
  )

  function resetForm() {
    setAssetId(''); setDate(new Date().toISOString().split('T')[0]); setType('buy')
    setQuantity(''); setPriceOrig(''); setPriceCurrency('BRL'); setValueBrl(''); setDescription('')
    setAssetSearch(''); setFormErr(null)
  }

  async function handleSave() {
    if (!assetId) { setFormErr('Selecione um ativo.'); return }
    const qty = parseNum(quantity)
    if (!qty || qty <= 0) { setFormErr('Informe uma quantidade válida.'); return }
    if (!date) { setFormErr('Informe a data.'); return }
    const vBrl = parseNum(valueBrl)
    if (!vBrl || vBrl <= 0) { setFormErr('Informe o valor total em BRL.'); return }

    setSaving(true); setFormErr(null)
    try {
      await apiFetch('/contributions', {
        method: 'POST',
        body: JSON.stringify({
          asset_id:    Number(assetId),
          date,
          type,
          quantity:    qty,
          price_orig:  parseNum(priceOrig) ?? undefined,
          currency:    priceCurrency,
          value_brl:   vBrl,
          description: description || undefined,
        }),
      })
      setShowForm(false)
      resetForm()
      refresh()
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateAsset() {
    if (!newCode.trim()) { setNewAssetErr('Informe o código do ativo.'); return }
    if (!newName.trim()) { setNewAssetErr('Informe o nome.'); return }
    setSavingNewAsset(true); setNewAssetErr(null)
    try {
      const created = await apiFetch<{ id: number; code: string; name: string; asset_type: string; currency: string }>('/assets', {
        method: 'POST',
        body: JSON.stringify({
          code:           newCode.trim(),
          name:           newName.trim(),
          asset_type:     newAssetType,
          currency:       newCurrency,
          asset_class_id: newClassId ? Number(newClassId) : null,
        }),
      })
      await loadAssets()
      setAssetId(String(created.id))
      setPriceCurrency(created.currency)
      setShowNewAsset(false)
      setNewCode(''); setNewName(''); setNewAssetType('ticker'); setNewCurrency('BRL'); setNewClassId('')
    } catch (e) {
      setNewAssetErr(e instanceof Error ? e.message : 'Erro ao criar ativo')
    } finally {
      setSavingNewAsset(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Remover este aporte?')) return
    try {
      await apiFetch(`/contributions/${id}`, { method: 'DELETE' })
      refresh()
    } catch { /* ignore */ }
  }

  const isSimpleAsset = selectedAsset && (selectedAsset.asset_type === 'fixed_income' || selectedAsset.asset_type === 'manual')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Aportes</h1>
        <button
          onClick={() => { if (showForm) resetForm(); setShowForm(f => !f) }}
          className="px-4 py-2 bg-[#001A70] text-white text-sm font-semibold rounded-xl hover:bg-[#001A70]/90 transition-colors"
        >
          {showForm ? 'Cancelar' : '+ Novo aporte'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-800">Registrar aporte / resgate</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Asset selector with search */}
            <div className="sm:col-span-2 space-y-1.5">
              <label className="block text-xs text-gray-500">Ativo</label>
              <input
                type="text"
                value={assetSearch}
                onChange={e => setAssetSearch(e.target.value)}
                placeholder="Filtrar por código ou nome..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
              />
              <div className="flex gap-2">
                <select
                  value={assetId}
                  onChange={e => { setAssetId(e.target.value); setAssetSearch('') }}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
                >
                  <option value="">Selecione um ativo...</option>
                  {filteredAssets.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name} ({a.currency})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewAsset(v => !v)}
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg text-[#001A70] hover:bg-blue-50 transition-colors shrink-0"
                  title="Criar novo ativo"
                >+ Ativo</button>
              </div>
            </div>

            {/* New asset inline form */}
            {showNewAsset && (
              <div className="sm:col-span-2 bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-[#001A70]">Novo ativo</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Codigo</label>
                    <input
                      type="text"
                      value={newCode}
                      onChange={e => setNewCode(e.target.value.toUpperCase())}
                      placeholder="ex: AAPL"
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Moeda</label>
                    <select
                      value={newCurrency}
                      onChange={e => setNewCurrency(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20 bg-white"
                    >
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Nome completo</label>
                    <input
                      type="text"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      placeholder="ex: Apple Inc."
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Tipo</label>
                    <select
                      value={newAssetType}
                      onChange={e => setNewAssetType(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20 bg-white"
                    >
                      {ASSET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Classe</label>
                    <select
                      value={newClassId}
                      onChange={e => setNewClassId(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20 bg-white"
                    >
                      <option value="">Sem classe</option>
                      {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
                {newAssetErr && <p className="text-xs text-red-600">{newAssetErr}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCreateAsset}
                    disabled={savingNewAsset}
                    className="px-3 py-1.5 bg-[#001A70] text-white text-xs font-semibold rounded-lg disabled:opacity-50"
                  >{savingNewAsset ? 'Criando...' : 'Criar ativo'}</button>
                  <button
                    type="button"
                    onClick={() => { setShowNewAsset(false); setNewAssetErr(null) }}
                    className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                  >Cancelar</button>
                </div>
              </div>
            )}

            {/* Date + Type */}
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
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                      type === t
                        ? t === 'buy' ? 'bg-green-600 text-white border-green-600' : 'bg-red-600 text-white border-red-600'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >{t === 'buy' ? 'Compra' : 'Venda'}</button>
                ))}
              </div>
            </div>

            {/* Quantity (hidden for manual/fixed_income) */}
            {!isSimpleAsset && (
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
            )}

            {/* Price with currency selector */}
            {!isSimpleAsset && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Preco unitario</label>
                <div className="flex gap-1.5">
                  <select
                    value={priceCurrency}
                    onChange={e => setPriceCurrency(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20 bg-white w-20 shrink-0"
                  >
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={priceOrig}
                    onChange={e => setPriceOrig(e.target.value)}
                    placeholder="0,00"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
                  />
                </div>
              </div>
            )}

            {/* Value BRL */}
            <div className={isSimpleAsset ? 'sm:col-span-2' : 'sm:col-span-2'}>
              <label className="block text-xs text-gray-500 mb-1">
                Valor total em BRL
                {priceCurrency !== 'BRL' && (fxRates as Record<string, number>)[priceCurrency] && (
                  <span className="ml-1 text-gray-400">
                    (1 {priceCurrency} = {(fxRates as Record<string, number>)[priceCurrency].toFixed(2)} BRL)
                  </span>
                )}
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={valueBrl}
                onChange={e => setValueBrl(e.target.value)}
                placeholder="0,00"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
              />
            </div>

            {/* Description */}
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Descricao (opcional)</label>
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
          >{saving ? 'Salvando...' : 'Registrar'}</button>
        </div>
      )}

      {/* Tabela de aportes */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">
            Historico{contributions.length > 0 ? ` (${contributions.length})` : ''}
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
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.assets.asset_classes.color }} />
                        )}
                        <span className="font-medium text-gray-900">{c.assets.code}</span>
                        <span className="text-gray-400 text-xs hidden sm:inline truncate max-w-[120px]">{c.assets.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        c.type === 'buy' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {c.type === 'buy' ? 'Compra' : 'Venda'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{fmtNum(c.quantity, 6)}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {c.value_brl != null ? fmt(c.value_brl) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors text-sm"
                        title="Remover"
                      >x</button>
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
