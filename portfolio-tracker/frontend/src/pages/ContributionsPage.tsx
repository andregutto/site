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

// Form-level type drives market lookup logic and maps to DB asset_type
const FORM_TYPES = [
  { value: 'ticker_b3',    label: 'Ativo B3 (acao / FII)',        dbType: 'ticker',       currency: 'BRL', market: 'b3'     },
  { value: 'ticker_intl',  label: 'Ativo Internacional (ETF...)', dbType: 'ticker',       currency: 'USD', market: 'intl'   },
  { value: 'cripto',       label: 'Cripto',                       dbType: 'ticker',       currency: 'USD', market: 'cripto' },
  { value: 'fixed_income', label: 'Renda fixa',                   dbType: 'fixed_income', currency: 'BRL', market: null     },
  { value: 'manual',       label: 'Valor manual',                 dbType: 'manual',       currency: 'BRL', market: null     },
] as const

type FormTypeValue = typeof FORM_TYPES[number]['value']

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
  const [assetId,       setAssetId]       = useState('')
  const [date,          setDate]          = useState(new Date().toISOString().split('T')[0])
  const [type,          setType]          = useState<'buy' | 'sell'>('buy')
  const [quantity,      setQuantity]      = useState('')
  const [priceOrig,     setPriceOrig]     = useState('')
  const [priceCurrency, setPriceCurrency] = useState('BRL')
  const [valueBrl,      setValueBrl]      = useState('')
  const [description,   setDescription]  = useState('')

  // new asset form fields
  const [newFormType,     setNewFormType]     = useState<FormTypeValue>('ticker_b3')
  const [newCode,         setNewCode]         = useState('')
  const [newName,         setNewName]         = useState('')
  const [newNameLoading,  setNewNameLoading]  = useState(false)
  const [newCurrency,     setNewCurrency]     = useState('BRL')
  const [newClassId,      setNewClassId]      = useState('')
  const [newCoingeckoId,  setNewCoingeckoId]  = useState('')

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

  // When existing asset changes, sync price currency
  useEffect(() => {
    if (selectedAsset) setPriceCurrency(selectedAsset.currency)
  }, [assetId, selectedAsset])

  // When showNewAsset opens, force type=buy (no selling an asset that doesn't exist yet)
  useEffect(() => {
    if (showNewAsset) setType('buy')
  }, [showNewAsset])

  // Auto-set currency when new asset form type changes
  useEffect(() => {
    const config = FORM_TYPES.find(t => t.value === newFormType)
    if (config) setNewCurrency(config.currency)
    setNewName('')
    setNewCode('')
    setNewCoingeckoId('')
    setNewNameLoading(false)
  }, [newFormType])

  // Auto-fetch name after code is typed (debounced 600ms) - ticker types only
  useEffect(() => {
    const config = FORM_TYPES.find(t => t.value === newFormType)
    const market = config?.market
    const code   = newCode.trim()
    if (!market || !code) {
      setNewName('')
      setNewCoingeckoId('')
      setNewNameLoading(false)
      return
    }
    setNewName('')
    setNewNameLoading(true)
    const timer = setTimeout(async () => {
      try {
        const result = await apiFetch<{ name: string | null; coingecko_id?: string | null }>(
          `/assets/lookup?code=${encodeURIComponent(code)}&market=${encodeURIComponent(market)}`
        )
        setNewName(result.name ?? '')
        if (result.coingecko_id) setNewCoingeckoId(result.coingecko_id)
      } catch {
        setNewName('')
      } finally {
        setNewNameLoading(false)
      }
    }, 600)
    return () => { clearTimeout(timer); setNewNameLoading(false) }
  }, [newCode, newFormType])

  // Auto-compute value_brl from qty x price x fx
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

  function resetNewAsset() {
    setNewCode(''); setNewName(''); setNewFormType('ticker_b3')
    setNewCurrency('BRL'); setNewClassId(''); setNewCoingeckoId('')
    setNewNameLoading(false); setNewAssetErr(null)
  }

  async function handleSave() {
    if (!assetId) { setFormErr('Selecione um ativo.'); return }
    const qty = parseNum(quantity)
    if (!qty || qty <= 0) { setFormErr('Informe uma quantidade valida.'); return }
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
    const config = FORM_TYPES.find(t => t.value === newFormType)
    const isTickerType = config?.market != null

    if (!newCode.trim()) { setNewAssetErr('Informe o codigo do ativo.'); return }
    if (isTickerType && newNameLoading) { setNewAssetErr('Aguarde a busca do nome.'); return }
    if (!newName.trim()) {
      setNewAssetErr(isTickerType
        ? 'Nome nao encontrado. Verifique o codigo.'
        : 'Informe o nome.')
      return
    }

    setSavingNewAsset(true); setNewAssetErr(null)
    try {
      const code         = newCode.trim().toUpperCase()
      const ticker_brapi = newFormType === 'ticker_b3'   ? code : undefined
      const ticker_yahoo = newFormType === 'ticker_intl' ? code
                         : newFormType === 'cripto'      ? `${code}-USD` : undefined
      const coingecko_id = newFormType === 'cripto' ? (newCoingeckoId || undefined) : undefined

      const created = await apiFetch<{ id: number; code: string; name: string; asset_type: string; currency: string }>('/assets', {
        method: 'POST',
        body: JSON.stringify({
          code,
          name:           newName.trim(),
          asset_type:     config?.dbType ?? 'ticker',
          currency:       newCurrency,
          asset_class_id: newClassId ? Number(newClassId) : null,
          ticker_brapi,
          ticker_yahoo,
          coingecko_id,
        }),
      })
      await loadAssets()
      setAssetId(String(created.id))
      setPriceCurrency(created.currency)
      setShowNewAsset(false)
      resetNewAsset()
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

  const isSimpleAsset  = selectedAsset && (selectedAsset.asset_type === 'fixed_income' || selectedAsset.asset_type === 'manual')
  const sellDisabled   = showNewAsset
  const isTickerForm   = ['ticker_b3', 'ticker_intl', 'cripto'].includes(newFormType)

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
                placeholder="Filtrar por codigo ou nome..."
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
                  onClick={() => { setShowNewAsset(v => !v); if (showNewAsset) resetNewAsset() }}
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
                  {/* Type selector */}
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Tipo</label>
                    <select
                      value={newFormType}
                      onChange={e => setNewFormType(e.target.value as FormTypeValue)}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20 bg-white"
                    >
                      {FORM_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Code */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Codigo</label>
                    <input
                      type="text"
                      value={newCode}
                      onChange={e => setNewCode(e.target.value.toUpperCase())}
                      placeholder={newFormType === 'cripto' ? 'ex: BTC' : newFormType === 'ticker_intl' ? 'ex: AAPL' : 'ex: PETR4'}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20 bg-white"
                    />
                  </div>

                  {/* Currency (hidden for B3 since always BRL) */}
                  {newFormType !== 'ticker_b3' ? (
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
                  ) : (
                    <div className="flex items-end pb-1">
                      <span className="text-xs text-gray-400">Moeda: BRL</span>
                    </div>
                  )}

                  {/* Name - readonly for ticker types, auto-filled */}
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">
                      Nome completo
                      {isTickerForm && (
                        <span className="ml-1 text-gray-400">
                          {newNameLoading ? '· buscando...' : newName ? '· preenchido automaticamente' : newCode ? '· nao encontrado' : '· preenchido apos digitar o codigo'}
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={newName}
                      readOnly={isTickerForm}
                      onChange={isTickerForm ? undefined : e => setNewName(e.target.value)}
                      placeholder={
                        isTickerForm
                          ? newNameLoading ? 'Buscando...'
                          : newCode ? 'Nome nao encontrado'
                          : 'Sera preenchido automaticamente'
                        : 'ex: Apple Inc.'
                      }
                      className={`w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20 ${
                        isTickerForm ? 'bg-gray-50 text-gray-500 cursor-default' : 'bg-white'
                      }`}
                    />
                  </div>

                  {/* Class */}
                  <div className="col-span-2">
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
                    disabled={savingNewAsset || newNameLoading}
                    className="px-3 py-1.5 bg-[#001A70] text-white text-xs font-semibold rounded-lg disabled:opacity-50"
                  >{savingNewAsset ? 'Criando...' : 'Criar ativo'}</button>
                  <button
                    type="button"
                    onClick={() => { setShowNewAsset(false); resetNewAsset() }}
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
                {(['buy', 'sell'] as const).map(btnType => {
                  const isSellDisabled = btnType === 'sell' && sellDisabled
                  return (
                    <button
                      key={btnType}
                      type="button"
                      onClick={() => { if (!isSellDisabled) setType(btnType) }}
                      disabled={isSellDisabled}
                      className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                        isSellDisabled
                          ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                          : type === btnType
                            ? btnType === 'buy' ? 'bg-green-600 text-white border-green-600' : 'bg-red-600 text-white border-red-600'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >{btnType === 'buy' ? 'Compra' : 'Venda'}</button>
                  )
                })}
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
            <div className="sm:col-span-2">
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
