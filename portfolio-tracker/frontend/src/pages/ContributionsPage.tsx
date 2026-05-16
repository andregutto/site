import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useContributions } from '../hooks/usePortfolio'
import { useCurrency } from '../contexts/CurrencyContext'
import { useAchievementContext } from '../contexts/AchievementContext'
import { apiFetch } from '../lib/api'
import { parseLocaleNum, inputCls } from '../lib/numparse'
import InstitutionSelect from '../components/InstitutionSelect'

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR')
}

function fmtNum(v: number, d = 4) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: d }).format(v)
}

function fmtBrl(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

interface AssetOption {
  id: number
  code: string
  name: string
  asset_type: string
  currency: string
  exchange: string | null
  fi_principal: number | null
  fi_start_date: string | null
  fi_type: string | null
  fi_maturity: string | null
  asset_classes: { id: number; name: string; color: string } | null
}

interface AssetClass { id: number; name: string; color: string }

const CURRENCIES = ['BRL', 'USD', 'EUR', 'GBP', 'CHF']

const FORM_TYPES = [
  { value: 'ticker_b3',    label: 'Ativo B3 (acao / FII)',        dbType: 'ticker',       currency: 'BRL', market: 'b3'     },
  { value: 'ticker_intl',  label: 'Ativo Internacional (ETF...)', dbType: 'ticker',       currency: 'USD', market: 'intl'   },
  { value: 'cripto',       label: 'Cripto',                       dbType: 'ticker',       currency: 'USD', market: 'cripto' },
  { value: 'fixed_income', label: 'Renda fixa',                   dbType: 'fixed_income', currency: 'BRL', market: null     },
  { value: 'manual',       label: 'Valor manual',                 dbType: 'manual',       currency: 'BRL', market: null     },
  { value: 'imovel',       label: 'Imovel fisico',                dbType: 'manual',       currency: 'BRL', market: null     },
] as const
type FormTypeValue = typeof FORM_TYPES[number]['value']

const FI_TYPES = [
  { value: 'pos_cdi',   label: 'Pos-fixado CDI'    },
  { value: 'selic',     label: 'Selic'              },
  { value: 'pre',       label: 'Pre-fixado'         },
  { value: 'ipca_plus', label: 'IPCA+'              },
]

function rateLabel(fiType: string) {
  if (fiType === 'pre')       return { label: 'Taxa (% a.a.)',        placeholder: 'ex: 12,5'  }
  if (fiType === 'ipca_plus') return { label: 'Spread IPCA+ (% a.a.)', placeholder: 'ex: 6,5'  }
  return                              { label: 'Taxa CDI/Selic (%)',   placeholder: 'ex: 102,5' }
}

const BASE_INPUT = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2'
const SMALL_INPUT = 'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20 bg-white'

export default function ContributionsPage() {
  const { data: contributions, loading, error, refresh } = useContributions()
  const { fmt, fxRates } = useCurrency()
  const { triggerCheck } = useAchievementContext()
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
  const [fieldErrors, setFieldErrors] = useState<{ quantity?: string; price?: string; valueBrl?: string }>({})

  function validateField(field: 'quantity' | 'price' | 'valueBrl', raw: string) {
    const v = parseLocaleNum(raw)
    let msg: string | undefined
    if (raw.trim() && (v === null || v < 0)) msg = 'Formato invalido'
    setFieldErrors(prev => ({ ...prev, [field]: msg }))
  }

  // contribution form
  const [assetId,       setAssetId]       = useState('')
  const [date,          setDate]          = useState(new Date().toISOString().split('T')[0])
  const [type,          setType]          = useState<'buy' | 'sell' | 'income'>('buy')
  const [quantity,      setQuantity]      = useState('')
  const [priceOrig,     setPriceOrig]     = useState('')
  const [priceCurrency, setPriceCurrency] = useState('BRL')
  const [valueBrl,      setValueBrl]      = useState('')
  const [description,   setDescription]  = useState('')

  // new asset form
  const [newFormType,     setNewFormType]     = useState<FormTypeValue>('ticker_b3')
  const [newCode,         setNewCode]         = useState('')
  const [newName,         setNewName]         = useState('')
  const [newNameLoading,  setNewNameLoading]  = useState(false)
  const [newCurrency,     setNewCurrency]     = useState('BRL')
  const [newClassId,      setNewClassId]      = useState('')
  const [newCoingeckoId,  setNewCoingeckoId]  = useState('')
  // RF-specific new asset fields
  const [newFiType,        setNewFiType]        = useState('pos_cdi')
  const [newFiRate,        setNewFiRate]        = useState('')
  const [newFiPrincipal,   setNewFiPrincipal]   = useState('')
  const [newFiStartDate,   setNewFiStartDate]   = useState('')
  const [newFiMaturity,    setNewFiMaturity]    = useState('')
  const [newFiInstitution, setNewFiInstitution] = useState('')
  // Imóvel-specific new asset fields
  const [newImvPurchaseDate,  setNewImvPurchaseDate]  = useState('')
  const [newImvPurchaseValue, setNewImvPurchaseValue] = useState('')
  const [newImvPurchaseBrl,   setNewImvPurchaseBrl]   = useState('')

  const today = new Date().toISOString().split('T')[0]

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

  useEffect(() => {
    if (selectedAsset) setPriceCurrency(selectedAsset.currency)
  }, [assetId, selectedAsset])

  useEffect(() => {
    if (showNewAsset) setType('buy')
  }, [showNewAsset])

  useEffect(() => {
    const config = FORM_TYPES.find(t => t.value === newFormType)
    if (config) setNewCurrency(config.currency)
    setNewName(''); setNewCode(''); setNewCoingeckoId(''); setNewNameLoading(false)
  }, [newFormType])

  // Auto-fetch ticker name
  useEffect(() => {
    const config = FORM_TYPES.find(t => t.value === newFormType)
    const market = config?.market
    const code   = newCode.trim()
    if (!market || !code) { setNewName(''); setNewCoingeckoId(''); setNewNameLoading(false); return }
    setNewName(''); setNewNameLoading(true)
    const timer = setTimeout(async () => {
      try {
        const result = await apiFetch<{ name: string | null; coingecko_id?: string | null }>(
          `/assets/lookup?code=${encodeURIComponent(code)}&market=${encodeURIComponent(market)}`
        )
        setNewName(result.name ?? '')
        if (result.coingecko_id) setNewCoingeckoId(result.coingecko_id)
      } catch { setNewName('') } finally { setNewNameLoading(false) }
    }, 600)
    return () => { clearTimeout(timer); setNewNameLoading(false) }
  }, [newCode, newFormType])

  // Auto-compute valueBrl for ticker assets
  useEffect(() => {
    if (selectedAsset?.asset_type === 'fixed_income') return
    const qty   = parseLocaleNum(quantity)
    const price = parseLocaleNum(priceOrig)
    if (!qty || !price) return
    if (priceCurrency === 'BRL') {
      setValueBrl((qty * price).toFixed(2).replace('.', ','))
    } else {
      const rate = (fxRates as Record<string, number>)[priceCurrency]
      if (rate) setValueBrl((qty * price * rate).toFixed(2).replace('.', ','))
    }
  }, [quantity, priceOrig, priceCurrency, fxRates, selectedAsset])

  const filteredAssets = assets.filter(a =>
    a.code.toLowerCase().includes(assetSearch.toLowerCase()) ||
    a.name.toLowerCase().includes(assetSearch.toLowerCase())
  )

  function resetForm() {
    setAssetId(''); setDate(today); setType('buy')
    setQuantity(''); setPriceOrig(''); setPriceCurrency('BRL'); setValueBrl(''); setDescription('')
    setAssetSearch(''); setFormErr(null); setFieldErrors({})
  }

  function resetNewAsset() {
    setNewCode(''); setNewName(''); setNewFormType('ticker_b3')
    setNewCurrency('BRL'); setNewClassId(''); setNewCoingeckoId(''); setNewNameLoading(false)
    setNewFiType('pos_cdi'); setNewFiRate(''); setNewFiPrincipal('')
    setNewFiStartDate(''); setNewFiMaturity(''); setNewFiInstitution('')
    setNewImvPurchaseDate(''); setNewImvPurchaseValue(''); setNewImvPurchaseBrl('')
    setNewAssetErr(null)
  }

  const isRfAsset     = selectedAsset?.asset_type === 'fixed_income'
  const isManualAsset = selectedAsset?.asset_type === 'manual'
  const isSimpleAsset = isRfAsset || isManualAsset
  const isRfBuy       = isRfAsset && type === 'buy'
  const isIncome      = type === 'income'
  const sellDisabled  = showNewAsset
  const isTickerForm  = ['ticker_b3', 'ticker_intl', 'cripto'].includes(newFormType)
  const rateCfg       = rateLabel(newFiType)

  async function handleSave() {
    if (!assetId) { setFormErr('Selecione um ativo.'); return }
    if (!date)    { setFormErr('Informe a data.'); return }

    if (isIncome) {
      const vBrl = parseLocaleNum(valueBrl)
      if (!vBrl || vBrl <= 0) { setFormErr('Informe o valor do rendimento.'); return }
      setSaving(true); setFormErr(null)
      try {
        await apiFetch('/contributions', {
          method: 'POST',
          body: JSON.stringify({
            asset_id: Number(assetId), date, type: 'income',
            quantity: 0, value_brl: vBrl,
            description: description || undefined,
          }),
        })
        setShowForm(false); resetForm(); refresh(); triggerCheck()
      } catch (e) {
        setFormErr(e instanceof Error ? e.message : 'Erro ao salvar')
      } finally { setSaving(false) }
      return
    }

    if (isRfBuy) {
      // RF aporte adicional
      const vBrl = parseLocaleNum(valueBrl)
      if (!vBrl || vBrl <= 0) { setFormErr('Informe o valor do aporte.'); return }
      setSaving(true); setFormErr(null)
      try {
        await apiFetch(`/assets/${Number(assetId)}/fi-deposit`, {
          method: 'POST',
          body: JSON.stringify({ date, value_brl: vBrl, notes: description || undefined }),
        })
        setShowForm(false); resetForm(); refresh(); triggerCheck()
      } catch (e) {
        setFormErr(e instanceof Error ? e.message : 'Erro ao salvar')
      } finally { setSaving(false) }
      return
    }

    if (isSimpleAsset) {
      // manual or RF sell: record contribution with qty=1
      const vBrl = parseLocaleNum(valueBrl)
      if (!vBrl || vBrl <= 0) { setFormErr('Informe o valor.'); return }
      setSaving(true); setFormErr(null)
      try {
        await apiFetch('/contributions', {
          method: 'POST',
          body: JSON.stringify({
            asset_id: Number(assetId), date, type,
            quantity: 1, value_brl: vBrl,
            description: description || undefined,
          }),
        })
        setShowForm(false); resetForm(); refresh(); triggerCheck()
      } catch (e) {
        setFormErr(e instanceof Error ? e.message : 'Erro ao salvar')
      } finally { setSaving(false) }
      return
    }

    // Standard ticker contribution
    const qty  = parseLocaleNum(quantity)
    const vBrl = parseLocaleNum(valueBrl)
    if (!qty || qty <= 0) { setFormErr('Informe uma quantidade valida.'); return }
    if (!vBrl || vBrl <= 0) { setFormErr('Informe o valor total em BRL.'); return }
    setSaving(true); setFormErr(null)
    try {
      await apiFetch('/contributions', {
        method: 'POST',
        body: JSON.stringify({
          asset_id:    Number(assetId),
          date, type,
          quantity:    qty,
          price_orig:  parseLocaleNum(priceOrig) ?? undefined,
          currency:    priceCurrency,
          value_brl:   vBrl,
          description: description || undefined,
        }),
      })
      setShowForm(false); resetForm(); refresh(); triggerCheck()
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  async function handleCreateAsset() {
    const config = FORM_TYPES.find(t => t.value === newFormType)
    const isTickerType = config?.market != null
    const isRfNew  = newFormType === 'fixed_income'
    const isImvNew = newFormType === 'imovel'

    if (!newCode.trim()) { setNewAssetErr('Informe o codigo do ativo.'); return }
    if (isTickerType && newNameLoading) { setNewAssetErr('Aguarde a busca do nome.'); return }
    if (!newName.trim()) {
      setNewAssetErr(isTickerType ? 'Nome nao encontrado. Verifique o codigo.' : 'Informe o nome.')
      return
    }
    if (isRfNew) {
      if (!newFiPrincipal || parseLocaleNum(newFiPrincipal) == null) { setNewAssetErr('Informe o valor investido.'); return }
      if (!newFiStartDate) { setNewAssetErr('Informe a data de inicio.'); return }
      if (!newFiRate || parseLocaleNum(newFiRate) == null) { setNewAssetErr('Informe a taxa contratada.'); return }
    }
    if (isImvNew) {
      if (!newImvPurchaseDate) { setNewAssetErr('Informe a data de compra.'); return }
      if (!newImvPurchaseValue || parseLocaleNum(newImvPurchaseValue) == null) { setNewAssetErr('Informe o valor de compra.'); return }
      if (newCurrency !== 'BRL' && (!newImvPurchaseBrl || parseLocaleNum(newImvPurchaseBrl) == null)) {
        setNewAssetErr('Informe o equivalente em BRL para registrar o custo.'); return
      }
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
          ticker_brapi, ticker_yahoo, coingecko_id,
        }),
      })

      if (isRfNew) {
        const principal = parseLocaleNum(newFiPrincipal) ?? 0
        const rateRaw   = parseLocaleNum(newFiRate) ?? 0
        const rateDecimal = rateRaw / 100
        await apiFetch(`/assets/${created.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            fi_type:       newFiType,
            fi_principal:  principal,
            fi_start_date: newFiStartDate,
            fi_maturity:   newFiMaturity || null,
            exchange:      newFiInstitution || null,
            ...(newFiType === 'ipca_plus'
              ? { fi_spread: rateDecimal, fi_rate: null }
              : { fi_rate: rateDecimal, fi_spread: null }),
          }),
        })
        await apiFetch('/contributions', {
          method: 'POST',
          body: JSON.stringify({
            asset_id: created.id, date: newFiStartDate, type: 'buy',
            quantity: 1, value_brl: principal, description: 'Aplicacao inicial',
          }),
        })
      }

      if (isImvNew) {
        const purchaseVal = parseLocaleNum(newImvPurchaseValue) ?? 0
        const purchaseBrl = newCurrency === 'BRL'
          ? purchaseVal
          : (parseLocaleNum(newImvPurchaseBrl) ?? purchaseVal)
        await apiFetch(`/assets/${created.id}/manual-value`, {
          method: 'POST',
          body: JSON.stringify({
            ref_date: newImvPurchaseDate, value: purchaseVal,
            currency: newCurrency, notes: 'Valor de compra',
          }),
        })
        await apiFetch('/contributions', {
          method: 'POST',
          body: JSON.stringify({
            asset_id: created.id, date: newImvPurchaseDate, type: 'buy',
            quantity: 1, value_brl: purchaseBrl, description: 'Compra do imovel',
          }),
        })
      }

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

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [editId, setEditId] = useState<number | null>(null)

  async function handleDelete(id: number) {
    if (confirmDeleteId !== id) { setConfirmDeleteId(id); return }
    setConfirmDeleteId(null)
    try {
      await apiFetch(`/contributions/${id}`, { method: 'DELETE' })
      refresh()
    } catch { /* ignore */ }
  }

  function handleEditClick(c: typeof contributions[number]) {
    setEditId(c.id)
    setAssetId(String(c.assets.id))
    setDate(c.date)
    setType(c.type as 'buy' | 'sell' | 'income')
    setQuantity(c.quantity != null ? String(c.quantity).replace('.', ',') : '')
    setPriceOrig(c.price_orig != null ? String(c.price_orig).replace('.', ',') : '')
    setPriceCurrency(c.currency ?? (assets.find(a => a.id === c.assets.id)?.currency ?? 'BRL'))
    setValueBrl(c.value_brl != null ? String(c.value_brl).replace('.', ',') : '')
    setDescription(c.description ?? '')
    setAssetSearch('')
    setFormErr(null)
    setFieldErrors({})
    setShowForm(true)
    setShowNewAsset(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditId(null)
    resetForm()
    setShowForm(false)
  }

  async function handleUpdate() {
    if (!editId) return
    if (!date) { setFormErr('Informe a data.'); return }

    const vBrl = parseLocaleNum(valueBrl)
    const qty  = parseLocaleNum(quantity)

    if (isIncome || isSimpleAsset) {
      if (!vBrl || vBrl <= 0) { setFormErr('Informe o valor.'); return }
    } else {
      if (!qty || qty <= 0) { setFormErr('Informe uma quantidade valida.'); return }
      if (!vBrl || vBrl <= 0) { setFormErr('Informe o valor total em BRL.'); return }
    }

    setSaving(true); setFormErr(null)
    try {
      await apiFetch(`/contributions/${editId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          date,
          type,
          quantity:   (isIncome || isSimpleAsset) ? (qty ?? 0) : qty,
          price_orig: parseLocaleNum(priceOrig) ?? null,
          currency:   priceCurrency || null,
          value_brl:  vBrl,
          description: description || null,
        }),
      })
      setEditId(null)
      setShowForm(false)
      resetForm()
      refresh()
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">Aportes</h1>
        <div className="flex items-center gap-2">
          <Link
            to="/import/b3"
            className="px-3 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            Importar B3
          </Link>
          <button
            onClick={() => { if (showForm) { cancelEdit() } else { setShowForm(true) } }}
            className="px-4 py-2 bg-[#001A70] text-white text-sm font-semibold rounded-xl hover:bg-[#001A70]/90 transition-colors"
          >
            {showForm ? 'Cancelar' : '+ Novo aporte'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-800">
            {editId ? 'Editar aporte' : 'Registrar aporte / resgate'}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Asset selector */}
            <div className="sm:col-span-2 space-y-1.5">
              <label className="block text-xs text-gray-500">Ativo</label>
              {editId ? (
                <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-600">
                  {selectedAsset ? `${selectedAsset.code} — ${selectedAsset.name}` : 'Ativo desconhecido'}
                </div>
              ) : (
                <>
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
                    >+ Ativo</button>
                  </div>
                </>
              )}
            </div>

            {/* New asset inline form */}
            {showNewAsset && (
              <div className="sm:col-span-2 bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-[#001A70]">Novo ativo</p>
                <div className="grid grid-cols-2 gap-2">
                  {/* Type */}
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Tipo</label>
                    <select
                      value={newFormType}
                      onChange={e => setNewFormType(e.target.value as FormTypeValue)}
                      className={SMALL_INPUT}
                    >
                      {FORM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>

                  {/* Code */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Codigo</label>
                    <input
                      type="text"
                      value={newCode}
                      onChange={e => setNewCode(newFormType === 'fixed_income' ? e.target.value : e.target.value.toUpperCase())}
                      placeholder={newFormType === 'cripto' ? 'ex: BTC' : newFormType === 'ticker_intl' ? 'ex: AAPL' : newFormType === 'fixed_income' ? 'ex: CDB-NUBANK' : newFormType === 'imovel' ? 'ex: APTO-PARIS' : 'ex: PETR4'}
                      className={SMALL_INPUT}
                    />
                  </div>

                  {/* Currency (hidden for B3 and RF) */}
                  {newFormType === 'imovel' ? (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Moeda</label>
                      <select value={newCurrency} onChange={e => setNewCurrency(e.target.value)} className={SMALL_INPUT}>
                        {['BRL', 'EUR', 'USD'].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  ) : newFormType !== 'ticker_b3' && newFormType !== 'fixed_income' && newFormType !== 'manual' ? (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Moeda</label>
                      <select value={newCurrency} onChange={e => setNewCurrency(e.target.value)} className={SMALL_INPUT}>
                        {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  ) : (
                    <div className="flex items-end pb-1">
                      <span className="text-xs text-gray-400">Moeda: {newCurrency}</span>
                    </div>
                  )}

                  {/* Name */}
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
                      placeholder={isTickerForm
                        ? newNameLoading ? 'Buscando...' : newCode ? 'Nao encontrado' : 'Preenchido automaticamente'
                        : newFormType === 'fixed_income' ? 'ex: CDB Nubank 102% CDI' : newFormType === 'imovel' ? 'ex: Apartamento Paris 11e' : 'ex: Fundo X'}
                      className={`w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20 ${isTickerForm ? 'bg-gray-50 text-gray-500 cursor-default' : 'bg-white'}`}
                    />
                  </div>

                  {/* Class */}
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Classe</label>
                    <select value={newClassId} onChange={e => setNewClassId(e.target.value)} className={SMALL_INPUT}>
                      <option value="">Sem classe</option>
                      {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  {/* Imóvel-specific fields */}
                  {newFormType === 'imovel' && (
                    <>
                      <div className="col-span-2 border-t border-blue-200 pt-2">
                        <p className="text-xs font-semibold text-[#001A70] mb-2">Dados do imovel</p>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Data de compra</label>
                        <input
                          type="date"
                          value={newImvPurchaseDate}
                          max={today}
                          onChange={e => setNewImvPurchaseDate(e.target.value)}
                          className={SMALL_INPUT}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Valor de compra ({newCurrency})</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={newImvPurchaseValue}
                          onChange={e => setNewImvPurchaseValue(e.target.value)}
                          placeholder="ex: 200.000,00"
                          className={SMALL_INPUT}
                        />
                      </div>
                      {newCurrency !== 'BRL' && (
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-500 mb-1">Equivalente em BRL (na data de compra)</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={newImvPurchaseBrl}
                            onChange={e => setNewImvPurchaseBrl(e.target.value)}
                            placeholder="ex: 1.280.000,00"
                            className={SMALL_INPUT}
                          />
                        </div>
                      )}
                    </>
                  )}

                  {/* RF-specific fields */}
                  {newFormType === 'fixed_income' && (
                    <>
                      <div className="col-span-2 border-t border-blue-200 pt-2">
                        <p className="text-xs font-semibold text-[#001A70] mb-2">Configuracao da renda fixa</p>
                      </div>

                      {/* fi_type */}
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-500 mb-1">Tipo</label>
                        <select value={newFiType} onChange={e => setNewFiType(e.target.value)} className={SMALL_INPUT}>
                          {FI_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>

                      {/* fi_rate */}
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">{rateCfg.label}</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={newFiRate}
                          onChange={e => setNewFiRate(e.target.value)}
                          placeholder={rateCfg.placeholder}
                          className={SMALL_INPUT}
                        />
                      </div>

                      {/* fi_principal */}
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Valor investido (R$)</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={newFiPrincipal}
                          onChange={e => setNewFiPrincipal(e.target.value)}
                          placeholder="ex: 50.000,00"
                          className={SMALL_INPUT}
                        />
                      </div>

                      {/* fi_start_date */}
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Data de inicio</label>
                        <input
                          type="date"
                          value={newFiStartDate}
                          max={today}
                          onChange={e => setNewFiStartDate(e.target.value)}
                          className={SMALL_INPUT}
                        />
                      </div>

                      {/* fi_maturity */}
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Vencimento (opc.)</label>
                        <input
                          type="date"
                          value={newFiMaturity}
                          onChange={e => setNewFiMaturity(e.target.value)}
                          className={SMALL_INPUT}
                        />
                      </div>

                      {/* institution */}
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-500 mb-1">Instituicao (opc.)</label>
                        <InstitutionSelect value={newFiInstitution} onChange={setNewFiInstitution} />
                      </div>
                    </>
                  )}
                </div>

                {newAssetErr && <p className="text-xs text-red-600">{newAssetErr}</p>}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCreateAsset}
                    disabled={savingNewAsset || newNameLoading}
                    className="px-3 py-1.5 bg-[#001A70] text-white text-xs font-semibold rounded-lg disabled:opacity-50"
                  >{savingNewAsset ? 'Criando...' : newFormType === 'fixed_income' ? 'Criar e configurar' : newFormType === 'imovel' ? 'Registrar imovel' : 'Criar ativo'}</button>
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
                max={today}
                onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tipo</label>
              <div className="flex gap-2">
                {(['buy', 'sell', 'income'] as const).map(btnType => {
                  const isSellDisabled = btnType === 'sell' && sellDisabled
                  const label = btnType === 'income' ? 'Rendimento'
                    : isRfAsset ? (btnType === 'buy' ? 'Aporte' : 'Resgate')
                    : (btnType === 'buy' ? 'Compra' : 'Venda')
                  const activeColor = btnType === 'buy' ? 'bg-green-600 text-white border-green-600'
                    : btnType === 'income' ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-red-600 text-white border-red-600'
                  return (
                    <button
                      key={btnType}
                      type="button"
                      onClick={() => { if (!isSellDisabled) setType(btnType) }}
                      disabled={isSellDisabled}
                      className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                        isSellDisabled
                          ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                          : type === btnType ? activeColor : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >{label}</button>
                  )
                })}
              </div>
            </div>

            {/* RF buy: show current principal info */}
            {isRfBuy && selectedAsset?.fi_principal != null && (
              <div className="sm:col-span-2 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm">
                <p className="text-xs text-gray-500">Saldo atual (principal)</p>
                <p className="font-semibold text-gray-800">{fmtBrl(selectedAsset.fi_principal)}</p>
                {selectedAsset.fi_type && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {FI_TYPES.find(t => t.value === selectedAsset.fi_type)?.label ?? selectedAsset.fi_type}
                    {selectedAsset.fi_start_date && ` · desde ${fmtDate(selectedAsset.fi_start_date)}`}
                    {selectedAsset.fi_maturity && ` · vence ${fmtDate(selectedAsset.fi_maturity)}`}
                  </p>
                )}
              </div>
            )}

            {/* Qty + Price (ticker only, not income) */}
            {!isSimpleAsset && !isIncome && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Quantidade</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  onBlur={e => validateField('quantity', e.target.value)}
                  placeholder="0,00"
                  className={inputCls(BASE_INPUT, !!fieldErrors.quantity)}
                />
                {fieldErrors.quantity && <p className="text-xs text-red-500 mt-0.5">{fieldErrors.quantity}</p>}
              </div>
            )}
            {!isSimpleAsset && !isIncome && (
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
                    onBlur={e => validateField('price', e.target.value)}
                    placeholder="0,00"
                    className={inputCls('flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2', !!fieldErrors.price)}
                  />
                </div>
                {fieldErrors.price && <p className="text-xs text-red-500 mt-0.5">{fieldErrors.price}</p>}
              </div>
            )}

            {/* Value BRL */}
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">
                {isIncome ? 'Valor recebido (R$)' : isRfBuy ? 'Valor do aporte adicional (R$)' : isRfAsset ? 'Valor resgatado (R$)' : isManualAsset ? 'Valor (R$)' : (
                  <>
                    Valor total em BRL
                    {priceCurrency !== 'BRL' && (fxRates as Record<string, number>)[priceCurrency] && (
                      <span className="ml-1 text-gray-400">
                        (1 {priceCurrency} = {(fxRates as Record<string, number>)[priceCurrency].toFixed(2)} BRL)
                      </span>
                    )}
                  </>
                )}
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={valueBrl}
                onChange={e => setValueBrl(e.target.value)}
                onBlur={e => validateField('valueBrl', e.target.value)}
                placeholder="0,00"
                className={inputCls(BASE_INPUT, !!fieldErrors.valueBrl)}
              />
              {fieldErrors.valueBrl && <p className="text-xs text-red-500 mt-0.5">{fieldErrors.valueBrl}</p>}
            </div>

            {/* Description */}
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">
                {isRfBuy ? 'Observacao (opcional)' : 'Descricao (opcional)'}
              </label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={isRfBuy ? 'ex: aporte mensal' : 'ex: compra na corretora XP'}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
              />
            </div>
          </div>

          {formErr && <p className="text-xs text-red-600">{formErr}</p>}

          <button
            onClick={editId ? handleUpdate : handleSave}
            disabled={saving}
            className="w-full bg-[#001A70] text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-[#001A70]/90 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Salvando...'
              : editId ? 'Salvar alteracoes'
              : isIncome ? 'Registrar rendimento'
              : isRfBuy ? 'Registrar aporte'
              : 'Registrar'}
          </button>
        </div>
      )}

      {/* Historico */}
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
                        c.type === 'buy' ? 'bg-green-100 text-green-700' :
                        c.type === 'income' ? 'bg-purple-100 text-purple-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {c.type === 'buy' ? 'Compra' : c.type === 'income' ? 'Rendimento' : 'Venda'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{fmtNum(c.quantity, 6)}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {c.value_brl != null ? fmt(c.value_brl) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {confirmDeleteId === c.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleDelete(c.id)}
                            className="text-xs font-semibold text-red-600 hover:text-red-700 transition-colors"
                          >Confirmar</button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                          >Cancelar</button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => { setConfirmDeleteId(null); handleEditClick(c) }}
                            className="text-gray-400 hover:text-[#001A70] transition-colors"
                            title="Editar"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDelete(c.id)}
                            className="text-gray-300 hover:text-red-500 transition-colors text-base leading-none"
                            title="Remover"
                          >×</button>
                        </div>
                      )}
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
