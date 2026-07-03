import { useState, useEffect, useRef, type CSSProperties } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { useAssetDetail, clearPerfCache, clearPortfolioValueCache } from '../hooks/usePortfolio'
import { useDividends } from '../hooks/useDividends'
import { useCurrency } from '../contexts/CurrencyContext'
import { useFavorites } from '../hooks/useFavorites'
import { useI18n } from '../contexts/I18nContext'
import { apiFetch } from '../lib/api'
import InstitutionSelect from '../components/InstitutionSelect'
import MigrateToFIModal from '../components/MigrateToFIModal'
import ManualValueModal from '../components/ManualValueModal'
import type { PortfolioAsset, ManualValue } from '../lib/types'
import { StatDelta, Banner } from '../components/ui'
import { ArvoTooltip, CHART_GRID_STROKE, CHART_AXIS_TICK, CHART_SERIES } from '../components/charts'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'

const LOCALE_MAP: Record<string, string> = { pt: 'pt-BR', en: 'en-US', fr: 'fr-FR' }

const kpiLabelStyle: CSSProperties = {
  fontFamily: 'var(--arvo-font-body)',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
  color: 'var(--arvo-fg-soft)',
  whiteSpace: 'nowrap',
}

const kpiValueStyle: CSSProperties = {
  fontFamily: 'var(--arvo-font-body)',
  letterSpacing: '0.04em',
  color: 'var(--arvo-fg)',
}

function fmtDate(iso: string, intlLocale: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString(intlLocale, { day: '2-digit', month: 'short', year: '2-digit' })
}

function fmtMonth(iso: string, intlLocale: string) {
  const [y, m] = iso.split('-')
  return new Date(parseInt(y), parseInt(m) - 1, 1)
    .toLocaleDateString(intlLocale, { month: 'short', year: '2-digit' })
}

function fmtNum(v: number, decimals = 4, intlLocale = 'pt-BR') {
  return new Intl.NumberFormat(intlLocale, { maximumFractionDigits: decimals }).format(v)
}

interface PriceSourceLabels {
  srcBcb: string; srcBrapi: string; srcYahoo: string
  srcCoingecko: string; srcManual: string; srcCostBasis: string
}

function priceSourceLabel(source: string | null | undefined, d: PriceSourceLabels): string {
  switch (source) {
    case 'bcb':        return d.srcBcb
    case 'brapi':      return d.srcBrapi
    case 'yahoo':      return d.srcYahoo
    case 'coingecko':  return d.srcCoingecko
    case 'manual':     return d.srcManual
    case 'cost_basis': return d.srcCostBasis
    default:           return source ?? ''
  }
}

interface FiLabels { fiOfCdi: string; fiOfSelic: string; fiAa: string; fiIpcaPlus: string }

function fiIndexerLabel(
  fi_type: string | null,
  fi_rate: number | null,
  fi_spread: number | null,
  d: FiLabels,
): string | null {
  if (!fi_type) return null
  if (fi_type === 'pos_cdi'   && fi_rate   != null) return `${(fi_rate   * 100).toFixed(1)}% ${d.fiOfCdi}`
  if (fi_type === 'selic'     && fi_rate   != null) return `${(fi_rate   * 100).toFixed(1)}% ${d.fiOfSelic}`
  if (fi_type === 'pre'       && fi_rate   != null) return `${(fi_rate   * 100).toFixed(2)}% ${d.fiAa}`
  if (fi_type === 'ipca_plus' && fi_spread != null) return `${d.fiIpcaPlus} + ${(fi_spread * 100).toFixed(2)}% ${d.fiAa}`
  return null
}

export default function AssetDetailPage() {
  const { id }     = useParams<{ id: string }>()
  const assetId    = id ? Number(id) : null
  const { favorites, toggleFavorite } = useFavorites()
  const navigate   = useNavigate()
  const location   = useLocation()
  const { data, loading, error, refresh } = useAssetDetail(assetId)

  // Auto-sync price history (shared 6h gate with DashboardPage)
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  const detailSyncFired = useRef(false)
  useEffect(() => {
    if (detailSyncFired.current) return
    const INTERVAL = 6 * 60 * 60 * 1000
    const lastSync = localStorage.getItem('price_last_sync')
    if (lastSync && Date.now() - new Date(lastSync).getTime() < INTERVAL) return
    detailSyncFired.current = true
    apiFetch('/portfolio/sync-history', { method: 'POST' })
      .then(() => {
        localStorage.setItem('price_last_sync', new Date().toISOString())
        clearPerfCache()
        refreshRef.current()
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { data: assetDividends, loading: divLoading } = useDividends(undefined, undefined, assetId ?? undefined)
  const { fmt, convert, currency } = useCurrency()
  const { t, locale } = useI18n()
  const d = t.assetDetail
  const td = (t as unknown as Record<string, Record<string, string>>).dividends ?? {}
  const intlLocale = LOCALE_MAP[locale] ?? 'pt-BR'

  const [archiving,          setArchiving]          = useState(false)
  const [editingInstitution, setEditingInstitution] = useState(false)
  const [institutionValue,   setInstitutionValue]   = useState('')
  const [savingInstitution,  setSavingInstitution]  = useState(false)
  const [editingSector,      setEditingSector]      = useState(false)
  const [sectorValue,        setSectorValue]        = useState('')
  const [savingSector,       setSavingSector]       = useState(false)
  const [editingName,        setEditingName]        = useState(false)
  const [nameValue,          setNameValue]          = useState('')
  const [savingName,         setSavingName]         = useState(false)
  const [editingClass,       setEditingClass]       = useState(false)
  const [classIdValue,       setClassIdValue]       = useState<number | null>(null)
  const [savingClass,        setSavingClass]        = useState(false)
  const [availableClasses,   setAvailableClasses]   = useState<{ id: number; name: string; color: string }[]>([])
  const [editingFiRate,      setEditingFiRate]      = useState(false)
  const [fiTypeValue,        setFiTypeValue]        = useState('')
  const [fiRateValue,        setFiRateValue]        = useState('')
  const [fiSpreadValue,      setFiSpreadValue]      = useState('')
  const [savingFiRate,       setSavingFiRate]       = useState(false)
  const [showMigrateModal,   setShowMigrateModal]   = useState(false)
  const [showManualModal,    setShowManualModal]    = useState(false)
  const [manualValueHistory, setManualValueHistory] = useState<ManualValue[]>([])
  const [chartPeriod,        setChartPeriod]        = useState<number | null | 'ytd'>(12)
  const [detailPeriod,       setDetailPeriod]       = useState<'all' | 'current_month' | 'last_30d' | 'last_12m' | 'ytd'>('all')
  const [splitWarnings,      setSplitWarnings]      = useState<import('../lib/types').SplitEvent[]>([])
  const [showSplitModal,     setShowSplitModal]     = useState(false)
  const [splitModalData,     setSplitModalData]     = useState<{ date: string; numerator: number; denominator: number } | null>(null)
  const [splitSubmitting,    setSplitSubmitting]    = useState(false)
  const [splitSuccess,       setSplitSuccess]       = useState(false)

  useEffect(() => {
    if (!id) return
    apiFetch<ManualValue[]>(`/assets/${id}/manual-values`)
      .then(setManualValueHistory)
      .catch(() => {})
    apiFetch<{ id: number; name: string; color: string }[]>('/assets/classes')
      .then(setAvailableClasses)
      .catch(() => {})
    apiFetch<{ splits: import('../lib/types').SplitEvent[] }>(`/assets/${id}/split-check`)
      .then(r => setSplitWarnings(r.splits ?? []))
      .catch(() => {})
  }, [id])

  async function handleArchive() {
    if (!id || !confirm(d.archiveConfirm)) return
    setArchiving(true)
    try {
      await apiFetch(`/assets/${id}/archive`, { method: 'POST' })
      navigate(-1)
    } catch { setArchiving(false) }
  }

  async function handleDeleteManualValue(valueId: number) {
    if (!id || !confirm(d.deleteManualValueConfirm)) return
    try {
      await apiFetch(`/assets/${id}/manual-value/${valueId}`, { method: 'DELETE' })
      setManualValueHistory(h => h.filter(v => v.id !== valueId))
      clearPortfolioValueCache()
      refresh()
    } catch { /* ignore */ }
  }

  async function handleSaveClass(newClassId: number | null) {
    if (!id) return
    setSavingClass(true)
    try {
      await apiFetch(`/assets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ asset_class_id: newClassId }),
      })
      setEditingClass(false)
      refresh()
    } catch { /* keep editing open */ } finally {
      setSavingClass(false)
    }
  }

  async function handleSaveSector() {
    if (!id) return
    setSavingSector(true)
    try {
      await apiFetch(`/assets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ sector: sectorValue.trim() || null }),
      })
      setEditingSector(false)
      refresh()
    } catch { /* keep editing open */ } finally {
      setSavingSector(false)
    }
  }

  async function handleSaveName() {
    if (!id) return
    setSavingName(true)
    try {
      await apiFetch(`/assets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: nameValue.trim() || null }),
      })
      setEditingName(false)
      refresh()
    } catch { /* keep editing open */ } finally {
      setSavingName(false)
    }
  }

  async function handleSaveFiRate() {
    if (!id) return
    setSavingFiRate(true)
    try {
      const body: Record<string, unknown> = { fi_type: fiTypeValue }
      if (fiTypeValue === 'ipca_plus') {
        body.fi_spread = parseFloat(fiSpreadValue) / 100
      } else {
        body.fi_rate = parseFloat(fiRateValue) / 100
      }
      await apiFetch(`/assets/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
      setEditingFiRate(false)
      refresh()
    } catch { /* keep editing open */ } finally {
      setSavingFiRate(false)
    }
  }

  async function handleSaveInstitution() {
    if (!id) return
    setSavingInstitution(true)
    try {
      await apiFetch(`/assets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ exchange: institutionValue.trim() || null }),
      })
      setEditingInstitution(false)
    } catch { /* keep editing open */ } finally {
      setSavingInstitution(false)
    }
  }

  async function handleSplitSubmit() {
    if (!id || !splitModalData) return
    setSplitSubmitting(true)
    try {
      await apiFetch(`/assets/${id}/split`, {
        method: 'POST',
        body: JSON.stringify(splitModalData),
      })
      setSplitSuccess(true)
      setSplitWarnings(w => w.filter(s => s.date !== splitModalData.date))
      setTimeout(() => { setShowSplitModal(false); setSplitSuccess(false); refresh() }, 1500)
    } catch { /* keep modal open */ } finally { setSplitSubmitting(false) }
  }

  // total_brl passado via navegação (do dashboard) para calcular % carteira
  const totalBrl: number = (location.state as { total_brl?: number } | null)?.total_brl ?? 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[var(--arvo-fg-soft)] text-sm animate-pulse">{d.loading}</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
        <p className="font-medium">{d.errorLoad}</p>
        <p className="text-sm mt-1">{error}</p>
        <button onClick={() => navigate(-1)} className="mt-3 text-sm underline">{d.back}</button>
      </div>
    )
  }


  const history = data.history ?? []
  const contributions = data.contributions ?? []

  const weightPct = totalBrl > 0 ? (data.current_value_brl / totalBrl) * 100 : null

  const priceLabel = data.current_price != null
    ? `${data.price_currency} ${fmtNum(data.current_price, 2, intlLocale)}`
    : '—'

  const currentPriceBrlDisplay = data.price_currency !== 'BRL' && data.holdings != null && data.holdings > 0 && data.current_value_brl > 0
    ? data.current_value_brl / data.holdings
    : null

  // Daily chart data — use directly for short periods
  const allDailyData = history
    .filter(h => h.value_brl > 0)
    .map(h => ({ label: fmtDate(h.date, intlLocale), value: convert(h.value_brl), date: h.date, invested: h.invested_brl != null ? convert(h.invested_brl) : undefined }))

  // Monthly chart data — for longer periods
  const allMonthlyData = (() => {
    const byMonth = new Map<string, { value: number; invested?: number }>()
    for (const h of history) {
      if (h.value_brl > 0) byMonth.set(h.date.substring(0, 7), { value: convert(h.value_brl), invested: h.invested_brl != null ? convert(h.invested_brl) : undefined })
    }
    return Array.from(byMonth.entries()).map(([monthKey, { value, invested }]) => ({
      label: fmtMonth(monthKey + '-01', intlLocale),
      value,
      date: monthKey + '-01',
      invested,
    }))
  })()

  const CHART_PERIODS: { label: string; months: number | null | 'ytd' }[] = [
    { label: '1M',              months: 1 },
    { label: '3M',              months: 3 },
    { label: '6M',              months: 6 },
    { label: 'YTD',             months: 'ytd' },
    { label: `1${d.chartYear}`, months: 12 },
    { label: `2${d.chartYear}`, months: 24 },
    { label: d.chartAll,        months: null },
  ]

  const ytdStartStr = `${new Date().getFullYear()}-01-01`

  const chartData = (() => {
    if (chartPeriod === 'ytd') return allDailyData.filter(p => p.date >= ytdStartStr)
    if (chartPeriod !== null && chartPeriod <= 6) {
      // daily for ≤6 months
      const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - chartPeriod)
      const cutStr = cutoff.toISOString().slice(0, 10)
      return allDailyData.filter(p => p.date >= cutStr)
    }
    if (chartPeriod !== null) return allMonthlyData.slice(-chartPeriod)
    const firstNonZero = allMonthlyData.findIndex(dd => dd.value > 0)
    return firstNonZero > 0 ? allMonthlyData.slice(firstNonZero) : allMonthlyData
  })()

  const isManual = data.asset_type === 'manual'
  const canUpdateManualValue = isManual || data.price_source === 'cost_basis' || data.price_source === 'manual'
  const lastManualDate = manualValueHistory.length > 0
    ? manualValueHistory[manualValueHistory.length - 1].ref_date
    : null
  const daysSinceUpdate = lastManualDate
    ? Math.floor((Date.now() - new Date(lastManualDate + 'T12:00:00').getTime()) / (1000 * 60 * 60 * 24))
    : null
  const isStale = canUpdateManualValue && (daysSinceUpdate === null || daysSinceUpdate > 30)

  const firstBuyValue = (() => {
    const buys = [...contributions]
      .filter(c => c.type === 'buy' && (c.value_brl ?? 0) > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
    return buys.length > 0 ? (buys[0].value_brl ?? null) : null
  })()

  const detailPeriodOptions = [
    { key: 'all'           as const, label: d.periodAll },
    { key: 'ytd'           as const, label: 'YTD' },
    { key: 'last_12m'      as const, label: t.performance.last12m },
    { key: 'last_30d'      as const, label: t.performance.last30d },
    { key: 'current_month' as const, label: t.performance.currentMonth },
  ]

  const periodStats = (() => {
    if (detailPeriod === 'all' || history.length === 0) {
      // All-time BRL return (gain_loss_pct) uses invested_brl at historical FX → includes real FX effect
      // Native return uses first price in history vs current price → pure price movement
      let nativeGainPct: number | null = null
      if (data.current_price && data.asset_type === 'ticker' && data.price_currency !== 'BRL') {
        const firstPriced = history.find(h => h.price > 0)
        if (firstPriced && firstPriced.price > 0) {
          nativeGainPct = Math.round((data.current_price / firstPriced.price - 1) * 10000) / 100
        }
      }
      return { gainBrl: data.gain_loss_brl, gainPct: data.gain_loss_pct, isAllTime: true, nativeGainPct }
    }
    const nowD = new Date()
    function toStr(dt: Date) {
      return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`
    }
    const startDate = (() => {
      switch (detailPeriod) {
        case 'current_month': return `${nowD.getFullYear()}-${String(nowD.getMonth()+1).padStart(2,'0')}-01`
        case 'last_30d': { const x = new Date(nowD); x.setDate(x.getDate()-29); return toStr(x) }
        case 'last_12m': { const x = new Date(nowD); x.setFullYear(x.getFullYear()-1); return toStr(x) }
        case 'ytd': return `${nowD.getFullYear()}-01-01`
      }
    })()
    const prevEntries = history.filter(h => h.date < startDate)
    const valueAtStart = prevEntries.length > 0 ? prevEntries[prevEntries.length-1].value_brl : 0
    const contribsInPeriod = contributions
      .filter(c => c.date >= startDate && c.type === 'buy')
      .reduce((s, c) => s + (c.value_brl ?? 0), 0)
    const gainBrl = data.current_value_brl - valueAtStart - contribsInPeriod
    const dietzBase = valueAtStart + 0.5 * contribsInPeriod
    const gainPct = dietzBase > 0 ? (gainBrl / dietzBase) * 100 : null

    // Native-currency return: (current_price / start_price_native - 1) — FX-neutral pure price return
    let nativeGainPct: number | null = null
    if (data.current_price && data.asset_type === 'ticker' && data.price_currency !== 'BRL') {
      const startNativePrice = prevEntries.length > 0 ? prevEntries[prevEntries.length - 1].price : null
      if (startNativePrice && startNativePrice > 0) {
        nativeGainPct = Math.round((data.current_price / startNativePrice - 1) * 10000) / 100
      }
    }

    return { gainBrl, gainPct, isAllTime: false, nativeGainPct }
  })()

  const mvEntriesWithChange = [...manualValueHistory]
    .sort((a, b) => a.ref_date.localeCompare(b.ref_date))
    .map((entry, i, arr) => {
      const prevValue = i > 0 ? arr[i - 1].value : firstBuyValue
      const changeAbs = prevValue != null ? entry.value - prevValue : null
      const changePct = prevValue != null && prevValue > 0
        ? ((entry.value - prevValue) / prevValue) * 100
        : null
      return { ...entry, changeAbs, changePct }
    })
    .reverse()

  return (
    <div className="space-y-6">
      {/* Split warning banner */}
      {splitWarnings.length > 0 && (
        <Banner
          variant="alert"
          action={
            <div className="flex flex-wrap gap-2 justify-end shrink-0">
              {splitWarnings.map(s => (
                <button
                  key={s.date}
                  onClick={() => { setSplitModalData({ date: s.date, numerator: s.numerator, denominator: s.denominator }); setShowSplitModal(true) }}
                  className="arvo-btn arvo-btn--link shrink-0"
                >
                  {s.ratio} · {s.date} {d.splitRegisterBtn} →
                </button>
              ))}
            </div>
          }
        >
          <span className="font-semibold" style={{ color: 'var(--arvo-fg)' }}>{d.splitWarningTitle}</span>{' '}
          {(d.splitWarningBody as string).replace('{n}', String(splitWarnings.length))}
        </Banner>
      )}

      {/* Split modal */}
      {showSplitModal && splitModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-[var(--arvo-surface)] rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="font-bold text-[var(--arvo-fg)]">{d.splitModalTitle}</h2>
            {splitSuccess ? (
              <p className="text-green-600 text-sm font-medium">{d.splitSuccess}</p>
            ) : (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-[var(--arvo-fg-muted)] uppercase tracking-wide">{d.splitDate}</label>
                    <input type="date" value={splitModalData.date}
                      onChange={e => setSplitModalData(p => p && { ...p, date: e.target.value })}
                      className="mt-1 w-full border border-[var(--arvo-border)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--arvo-fg)]/30" />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-[var(--arvo-fg-muted)] uppercase tracking-wide">{d.splitNumerator}</label>
                      <input type="number" min="1" value={splitModalData.numerator}
                        onChange={e => setSplitModalData(p => p && { ...p, numerator: Number(e.target.value) })}
                        className="mt-1 w-full border border-[var(--arvo-border)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--arvo-fg)]/30" />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-[var(--arvo-fg-muted)] uppercase tracking-wide">{d.splitDenominator}</label>
                      <input type="number" min="1" value={splitModalData.denominator}
                        onChange={e => setSplitModalData(p => p && { ...p, denominator: Number(e.target.value) })}
                        className="mt-1 w-full border border-[var(--arvo-border)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--arvo-fg)]/30" />
                    </div>
                  </div>
                  <p className="text-xs text-[var(--arvo-fg-soft)]">{d.splitTypeLabel}</p>
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={() => setShowSplitModal(false)}
                    className="flex-1 border border-[var(--arvo-border)] rounded-xl py-2 text-sm text-[var(--arvo-fg-muted)] hover:bg-[var(--arvo-surface-2)]">✕</button>
                  <button onClick={handleSplitSubmit} disabled={splitSubmitting}
                    className="flex-1 bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] rounded-xl py-2 text-sm font-medium disabled:opacity-50">
                    {splitSubmitting ? '…' : d.splitSubmit}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <span className="arvo-eyebrow block mb-1">{t.nav.assets}</span>
          {/* Title row: back + favorite + code (code gets all remaining width) */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => navigate(-1)}
              className="w-7 h-7 rounded-lg border border-[var(--arvo-border)] flex items-center justify-center text-[var(--arvo-fg-muted)] hover:border-[var(--arvo-fg)] hover:text-[var(--arvo-fg)] transition-colors shrink-0"
            >‹</button>
            {assetId && (
              <button
                onClick={() => toggleFavorite(assetId)}
                className="w-7 h-7 rounded-lg border border-[var(--arvo-border)] flex items-center justify-center transition-colors shrink-0 hover:border-amber-400"
                title={favorites.has(assetId) ? d.removeFavorite : d.addFavorite}
              >
                <svg
                  className={`w-4 h-4 transition-colors ${favorites.has(assetId) ? 'text-amber-400' : 'text-[var(--arvo-fg-faint)]'}`}
                  fill={favorites.has(assetId) ? 'currentColor' : 'none'}
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={favorites.has(assetId) ? 0 : 1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                </svg>
              </button>
            )}
            <h1
              className="flex-1 min-w-0"
              style={{
                fontFamily: 'var(--arvo-font-display)',
                fontWeight: 400,
                fontSize: 'clamp(22px, 2.2vw, 26px)',
                letterSpacing: 'var(--arvo-track-normal)',
                lineHeight: 'var(--arvo-leading-tight)',
                color: 'var(--arvo-fg)',
              }}
            >{data.code}</h1>
          </div>

          {/* Name (editable) */}
          {editingName ? (
            <span className="flex items-center gap-1 mt-0.5">
              <input
                type="text"
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false) }}
                className="text-sm border border-[var(--arvo-border)] rounded-lg px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-[var(--arvo-fg)]/30 flex-1 min-w-0"
                autoFocus
              />
              <button onClick={handleSaveName} disabled={savingName} className="text-xs text-[var(--arvo-fg)] font-semibold disabled:opacity-50">OK</button>
              <button onClick={() => setEditingName(false)} className="text-xs text-[var(--arvo-fg-soft)]">✕</button>
            </span>
          ) : (
            <button
              onClick={() => { setNameValue(data.name); setEditingName(true) }}
              title={d.editName}
              className="text-sm text-[var(--arvo-fg-muted)] mt-0.5 truncate text-left max-w-full hover:text-[var(--arvo-fg)] transition-colors"
            >
              {data.name}
            </button>
          )}

          {/* Metadata pills */}
          <div className="flex flex-wrap items-center gap-1 mt-1.5">
            {editingClass ? (
              <span className="flex items-center gap-1">
                <select
                  autoFocus
                  value={classIdValue ?? ''}
                  onChange={e => {
                    const val = e.target.value === '' ? null : Number(e.target.value)
                    setClassIdValue(val)
                    handleSaveClass(val)
                  }}
                  disabled={savingClass}
                  className="text-xs border border-[var(--arvo-border)] rounded-lg px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-[var(--arvo-fg)]/30 bg-[var(--arvo-surface)] disabled:opacity-50"
                >
                  <option value="">{d.noClass}</option>
                  {availableClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {!savingClass && (
                  <button onClick={() => setEditingClass(false)} className="text-xs text-[var(--arvo-fg-soft)]">✕</button>
                )}
              </span>
            ) : (
              <button
                onClick={() => { setClassIdValue(data.class_id); setEditingClass(true) }}
                title={d.changeClass}
                className="text-xs px-2 py-0.5 rounded-full text-white font-medium hover:opacity-75 transition-opacity"
                style={{ backgroundColor: data.class_color }}
              >{data.class_name}</button>
            )}
            {data.fi_type && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                {data.fi_type.replace('_', ' ').replace('plus', '+').toUpperCase()}
              </span>
            )}
            {data.asset_type === 'fixed_income' && fiIndexerLabel(data.fi_type, data.fi_rate, data.fi_spread, d) && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 border border-green-200 text-green-700 font-semibold">
                {d.earning} {fiIndexerLabel(data.fi_type, data.fi_rate, data.fi_spread, d)}
              </span>
            )}
            {data.asset_type === 'manual' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--arvo-track-bg)] border border-[var(--arvo-border)] text-[var(--arvo-fg-muted)] font-medium">
                Manual
              </span>
            )}
            {data.asset_type === 'ticker' && data.avg_cost_brl != null && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--arvo-track-bg)] border border-[var(--arvo-border)] text-[var(--arvo-fg-muted)] font-semibold">
                PM {data.price_currency !== 'BRL' ? 'BRL' : data.price_currency} {fmtNum(data.avg_cost_brl, 2, intlLocale)}
              </span>
            )}
            {editingSector ? (
              <span className="flex items-center gap-1">
                <input
                  type="text"
                  value={sectorValue}
                  onChange={e => setSectorValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveSector(); if (e.key === 'Escape') setEditingSector(false) }}
                  placeholder={d.sectorPlaceholder}
                  className="text-xs border border-[var(--arvo-border)] rounded-lg px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-[var(--arvo-fg)]/30 w-36"
                  autoFocus
                />
                <button onClick={handleSaveSector} disabled={savingSector} className="text-xs text-[var(--arvo-fg)] font-semibold disabled:opacity-50">OK</button>
                <button onClick={() => setEditingSector(false)} className="text-xs text-[var(--arvo-fg-soft)]">✕</button>
              </span>
            ) : (
              <button
                onClick={() => { setSectorValue(data.sector ?? ''); setEditingSector(true) }}
                title={d.setSector}
                className={`text-xs px-2 py-0.5 rounded-full border font-medium transition-colors hover:border-[var(--arvo-fg)]/50 ${
                  data.sector
                    ? 'bg-teal-50 border-teal-200 text-teal-700'
                    : 'border-dashed border-[var(--arvo-border)] text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg-muted)]'
                }`}
              >
                {data.sector ?? d.addSector}
              </button>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {!isManual && (
              <Link
                to={`/portfolio?assetId=${id}&new=1`}
                className="text-xs text-[var(--arvo-fg)] border border-[var(--arvo-fg)]/30 hover:bg-blue-50 rounded-lg px-2.5 py-1 transition-colors"
              >{d.addContrib}</Link>
            )}
            {canUpdateManualValue && (
              <button
                onClick={() => setShowManualModal(true)}
                className="text-xs text-[var(--arvo-fg)] border border-[var(--arvo-fg)]/30 hover:bg-blue-50 rounded-lg px-2.5 py-1 transition-colors font-medium"
              >{d.updateValue}</button>
            )}
            {isManual && (
              <button
                onClick={() => setShowMigrateModal(true)}
                className="text-xs text-blue-600 border border-blue-200 hover:bg-blue-50 rounded-lg px-2.5 py-1 transition-colors"
              >{d.convertToFI}</button>
            )}
            <button
              onClick={handleArchive}
              disabled={archiving}
              className="text-xs text-red-400 border border-red-200 hover:bg-red-50 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v.5H2v-.5ZM2 5.5h12v7A1.5 1.5 0 0 1 12.5 14h-9A1.5 1.5 0 0 1 2 12.5v-7Zm4.5 2a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1h-3Z" />
              </svg>
              {d.archive}
            </button>
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          {data.current_price != null && (
            <>
              <p className="font-bold text-[var(--arvo-fg)]">{priceLabel}</p>
              {currentPriceBrlDisplay != null && (
                <p className="text-xs text-[var(--arvo-fg-muted)] font-medium">BRL {fmtNum(currentPriceBrlDisplay, 2, intlLocale)}</p>
              )}
              <p className="text-xs text-[var(--arvo-fg-soft)]">{priceSourceLabel(data.price_source, d)}</p>
            </>
          )}
          {editingInstitution ? (
            <div className="flex items-center gap-1 mt-1 w-52">
              <div className="flex-1">
                <InstitutionSelect
                  value={institutionValue}
                  onChange={setInstitutionValue}
                  placeholder={d.institutionPlaceholder}
                  autoFocus
                />
              </div>
              <button
                onClick={handleSaveInstitution}
                disabled={savingInstitution}
                className="text-xs text-[var(--arvo-fg)] font-semibold disabled:opacity-50 shrink-0"
              >OK</button>
              <button onClick={() => setEditingInstitution(false)} className="text-xs text-[var(--arvo-fg-soft)] shrink-0">✕</button>
            </div>
          ) : (
            <button
              onClick={() => { setInstitutionValue(data.exchange ?? ''); setEditingInstitution(true) }}
              className="text-xs text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg)] border border-[var(--arvo-border)] hover:border-[var(--arvo-fg)] rounded-lg px-2.5 py-1 transition-colors mt-1"
            >
              {data.exchange || d.noInstitution}
            </button>
          )}
        </div>
      </div>

      {/* Period selector for summary cards */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {detailPeriodOptions.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setDetailPeriod(key)}
            style={{
              fontFamily: "var(--arvo-font-body)",
              fontSize: 10,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              padding: '5px 10px',
              borderRadius: 6,
              border: `1px solid ${detailPeriod === key ? 'var(--arvo-fg)' : 'var(--arvo-border)'}`,
              background: detailPeriod === key ? 'var(--arvo-fg)' : 'var(--arvo-surface)',
              color: detailPeriod === key ? 'var(--arvo-pill-active-fg)' : 'var(--arvo-fg-muted)',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >{label}</button>
        ))}
      </div>

      {/* KPIs em faixa */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)' }}>
        <div className={`grid grid-cols-2 sm:grid-cols-4 ${data.total_income_brl > 0 ? 'lg:grid-cols-5' : ''} gap-4 sm:gap-6`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={kpiLabelStyle}>{d.currentValue}</span>
            <span className="arvo-num text-base sm:text-lg" style={kpiValueStyle}>{fmt(data.current_value_brl)}</span>
          </div>
          <div className="sm:border-l sm:pl-6" style={{ display: 'flex', flexDirection: 'column', gap: 6, borderColor: 'var(--arvo-border)' }}>
            <span style={kpiLabelStyle}>{d.invested}</span>
            <span className="arvo-num text-base sm:text-lg" style={kpiValueStyle}>{data.invested_brl > 0 ? fmt(data.invested_brl) : '—'}</span>
          </div>
          {/* P&L — % prominent, absolute value secondary */}
          <div className="sm:border-l sm:pl-6" style={{ display: 'flex', flexDirection: 'column', gap: 6, borderColor: 'var(--arvo-border)' }}>
            <span style={kpiLabelStyle}>{periodStats.isAllTime ? d.gainLoss : d.periodGain}</span>
            {periodStats.gainPct != null ? (
              <>
                <span className="inline-flex items-baseline gap-1">
                  <StatDelta className="text-base sm:text-lg" value={periodStats.gainPct} formatted={`${Math.abs(periodStats.gainPct).toFixed(2)}%`} />
                  {periodStats.isAllTime && data.price_currency !== 'BRL' && (
                    <span className="text-[10px] font-normal" style={{ color: 'var(--arvo-fg-soft)' }}>BRL</span>
                  )}
                </span>
                <span className={`arvo-num text-xs ${periodStats.gainBrl > 0 ? 'arvo-delta-pos' : periodStats.gainBrl < 0 ? 'arvo-delta-neg' : 'arvo-delta-neutral'}`}>
                  {periodStats.gainBrl >= 0 ? '+' : ''}{fmt(periodStats.gainBrl)}
                </span>
                {/* For all-time: show native currency % (different because invested_brl used real historical FX) */}
                {periodStats.nativeGainPct != null && periodStats.isAllTime && (
                  <span className="text-xs" style={{ color: 'var(--arvo-fg-soft)' }}>
                    {data.price_currency}: {periodStats.nativeGainPct >= 0 ? '+' : ''}{periodStats.nativeGainPct.toFixed(2)}%
                  </span>
                )}
              </>
            ) : (
              <span className="arvo-num text-base sm:text-lg" style={{ color: 'var(--arvo-fg-faint)' }}>—</span>
            )}
          </div>
          {/* Quantity (tickers) or portfolio weight */}
          <div className="sm:border-l sm:pl-6" style={{ display: 'flex', flexDirection: 'column', gap: 6, borderColor: 'var(--arvo-border)' }}>
            {data.holdings != null ? (
              <>
                <span style={kpiLabelStyle}>{d.quantity}</span>
                <span className="arvo-num text-base sm:text-lg" style={kpiValueStyle}>{fmtNum(data.holdings, 6, intlLocale)}</span>
                {data.avg_cost_brl != null && (
                  <span className="text-xs" style={{ color: 'var(--arvo-fg-soft)' }}>{d.avgCostSub} {fmt(data.avg_cost_brl)}</span>
                )}
              </>
            ) : weightPct != null ? (
              <>
                <span style={kpiLabelStyle}>{d.weight}</span>
                <span className="arvo-num text-base sm:text-lg" style={kpiValueStyle}>{weightPct.toFixed(1)}%</span>
              </>
            ) : (
              <>
                <span style={kpiLabelStyle}>{d.weight}</span>
                <span className="arvo-num text-base sm:text-lg" style={{ color: 'var(--arvo-fg-faint)' }}>—</span>
              </>
            )}
          </div>
          {data.total_income_brl > 0 && (
            <div className="col-span-2 sm:col-span-1 sm:border-l sm:pl-6" style={{ display: 'flex', flexDirection: 'column', gap: 6, borderColor: 'var(--arvo-border)' }}>
              <span style={kpiLabelStyle}>{d.totalReturn}</span>
              <StatDelta className="text-base sm:text-lg" value={data.total_income_brl} formatted={fmt(data.total_income_brl)} />
            </div>
          )}
        </div>
      </div>

      {/* Fixed income indexer */}
      {data.asset_type === 'fixed_income' && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-blue-900 text-sm">{d.indexerTitle}</h2>
            {!editingFiRate ? (
              <button
                onClick={() => {
                  setFiTypeValue(data.fi_type ?? 'pos_cdi')
                  setFiRateValue(data.fi_rate != null ? (data.fi_rate * 100).toFixed(1) : '')
                  setFiSpreadValue(data.fi_spread != null ? (data.fi_spread * 100).toFixed(2) : '')
                  setEditingFiRate(true)
                }}
                className="text-xs text-blue-600 border border-blue-200 rounded-lg px-2.5 py-1 hover:bg-blue-100 transition-colors"
              >{d.editBtn}</button>
            ) : (
              <button onClick={() => setEditingFiRate(false)} className="text-xs text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg-muted)]">✕</button>
            )}
          </div>
          {editingFiRate ? (
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <p className="text-[10px] text-blue-500 uppercase mb-1">{d.indexerType}</p>
                <select
                  value={fiTypeValue}
                  onChange={e => setFiTypeValue(e.target.value)}
                  className="text-sm border border-blue-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300 bg-[var(--arvo-surface)]"
                >
                  <option value="pos_cdi">{d.fiPosCdi}</option>
                  <option value="selic">{d.fiSelic}</option>
                  <option value="pre">{d.fiPre}</option>
                  <option value="ipca_plus">{d.fiIpcaPlus}</option>
                </select>
              </div>
              {fiTypeValue === 'ipca_plus' ? (
                <div>
                  <p className="text-[10px] text-blue-500 uppercase mb-1">{d.spreadAa}</p>
                  <input
                    type="number" step="0.01"
                    value={fiSpreadValue}
                    onChange={e => setFiSpreadValue(e.target.value)}
                    className="w-24 text-sm border border-blue-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300"
                    placeholder="6.50"
                  />
                </div>
              ) : (
                <div>
                  <p className="text-[10px] text-blue-500 uppercase mb-1">
                    {fiTypeValue === 'pre' ? d.rateAa : d.rateCdi}
                  </p>
                  <input
                    type="number" step="0.1"
                    value={fiRateValue}
                    onChange={e => setFiRateValue(e.target.value)}
                    className="w-28 text-sm border border-blue-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300"
                    placeholder="102.5"
                  />
                </div>
              )}
              <button
                onClick={handleSaveFiRate}
                disabled={savingFiRate}
                className="text-xs text-white bg-blue-600 rounded-lg px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {savingFiRate ? '…' : d.save}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div>
                <p className="text-xs text-blue-500 uppercase tracking-wide mb-0.5">{d.indexerSaved}</p>
                <p className="font-bold text-blue-900 text-sm">
                  {fiIndexerLabel(data.fi_type, data.fi_rate, data.fi_spread, d) ?? '—'}
                </p>
              </div>
              {(data.gain_loss_pct != null) && (
                <>
                  <div className="w-px h-8 bg-blue-200 hidden sm:block" />
                  <div>
                    <p className="text-xs text-blue-500 uppercase tracking-wide mb-0.5">{d.accReturn}</p>
                    <p className={`font-bold text-sm ${
                      data.gain_loss_pct >= 0 ? 'text-green-700' : 'text-red-600'
                    }`}>
                      {data.gain_loss_pct >= 0 ? '+' : ''}{data.gain_loss_pct.toFixed(2)}%
                    </p>
                  </div>
                  <div className="w-px h-8 bg-blue-200 hidden sm:block" />
                  <div>
                    <p className="text-xs text-blue-500 uppercase tracking-wide mb-0.5">{d.totalProfit}</p>
                    <p className={`font-bold text-sm ${
                      data.gain_loss_brl >= 0 ? 'text-green-700' : 'text-red-600'
                    }`}>
                      {data.gain_loss_brl >= 0 ? '+' : ''}{fmt(data.gain_loss_brl)}
                    </p>
                  </div>
                </>
              )}
              {data.fi_start_date && (
                <>
                  <div className="w-px h-8 bg-blue-200 hidden sm:block" />
                  <div>
                    <p className="text-xs text-blue-500 uppercase tracking-wide mb-0.5">{d.since}</p>
                    <p className="font-bold text-blue-900 text-sm">{fmtDate(data.fi_start_date, intlLocale)}</p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Stale value alert */}
      {isStale && (
        <Banner
          variant="alert"
          action={
            <button
              onClick={() => setShowManualModal(true)}
              className="arvo-btn arvo-btn--link shrink-0"
            >{d.updateBtn}</button>
          }
        >
          <span className="font-semibold" style={{ color: 'var(--arvo-fg)' }}>
            {daysSinceUpdate === null
              ? d.staleNoValue
              : d.staleDays.replace('{n}', String(daysSinceUpdate))}
          </span>{' '}
          {d.staleBody}
        </Banner>
      )}

      {/* Portfolio weight bar */}
      {data.holdings != null && weightPct != null && (
        <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--arvo-fg-muted)]">{d.weight}</span>
            <span className="font-semibold text-[var(--arvo-fg)]">{weightPct.toFixed(2)}%</span>
          </div>
          <div className="mt-2 h-2 bg-[var(--arvo-track-bg)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--arvo-fg)] rounded-full transition-all"
              style={{ width: `${Math.min(weightPct, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Value evolution chart */}
      {allDailyData.length > 1 && (
        <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[var(--arvo-fg)]">{d.chartTitle}</h2>
            <div className="flex gap-1 flex-wrap justify-end">
              {CHART_PERIODS.filter(p => {
                if (p.months == null || p.months === 'ytd') return true
                return allMonthlyData.length >= p.months
              }).map(p => (
                <button
                  key={p.label}
                  onClick={() => setChartPeriod(p.months)}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                    chartPeriod === p.months
                      ? 'bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)]'
                      : 'text-[var(--arvo-fg-muted)] hover:bg-[var(--arvo-track-bg)]'
                  }`}
                >{p.label}</button>
              ))}
            </div>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={CHART_AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={CHART_AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => {
                    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}k`
                    return String(v)
                  }}
                  width={50}
                  domain={(() => {
                    const maxInv = Math.max(0, ...chartData.map(pt => (pt as { invested?: number }).invested ?? 0))
                    const ref = maxInv > 0 ? maxInv : convert(data.invested_brl)
                    return ref > 0
                      ? [(dMin: number) => Math.min(dMin, ref) * 0.97, (dMax: number) => Math.max(dMax, ref) * 1.03]
                      : ['auto', 'auto' as const]
                  })()}
                />
                <Tooltip
                  content={
                    <ArvoTooltip
                      formatter={(v, name) => [
                        new Intl.NumberFormat(intlLocale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(v),
                        name === 'invested' ? d.investedRef : d.tooltipValue,
                      ]}
                    />
                  }
                />
                {chartData.some(pt => (pt as { invested?: number }).invested != null) ? (
                  <Line
                    type="stepAfter"
                    dataKey="invested"
                    stroke={CHART_SERIES.ocre}
                    strokeWidth={1.5}
                    strokeDasharray="4 2"
                    dot={false}
                    activeDot={false}
                    name="invested"
                  />
                ) : data.invested_brl > 0 ? (
                  <ReferenceLine
                    y={convert(data.invested_brl)}
                    stroke={CHART_SERIES.ocre}
                    strokeDasharray="4 2"
                    label={{ value: d.investedRef, fontSize: 10, fill: 'var(--arvo-ocre)' }}
                  />
                ) : null}
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={CHART_SERIES.portfolio}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {showMigrateModal && (
        <MigrateToFIModal
          assetId={data.id}
          assetName={data.name}
          assetCode={data.code}
          investedBrl={data.invested_brl}
          hasContributions={contributions.length > 0}
          onClose={() => setShowMigrateModal(false)}
          onSaved={() => { setShowMigrateModal(false); refresh() }}
        />
      )}

      {showManualModal && canUpdateManualValue && (() => {
        const assetForModal: PortfolioAsset = {
          id:              data.id,
          code:            data.code,
          name:            data.name,
          currency:        data.currency,
          class_id:        null,
          class_name:      data.class_name,
          class_color:     data.class_color,
          value_brl:       data.current_value_brl,
          value_orig:      data.current_value_brl,
          holdings:        data.holdings,
          price:           data.current_price,
          source:          'manual',
          needs_manual:    false,
          invested_brl:    data.invested_brl,
          last_manual_date: null,
        }
        return (
          <ManualValueModal
            asset={assetForModal}
            initialMode="valorizacao"
            onClose={() => setShowManualModal(false)}
            onSaved={() => { setShowManualModal(false); clearPortfolioValueCache(); refresh() }}
          />
        )
      })()}

      {/* Manual value history */}
      {canUpdateManualValue && mvEntriesWithChange.length > 0 && (
        <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-[var(--arvo-border)]">
            <h2 className="font-semibold text-[var(--arvo-fg)]">{d.manualHistTitle} ({mvEntriesWithChange.length})</h2>
          </div>
          {/* desktop */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--arvo-surface-2)] text-[var(--arvo-fg-muted)] text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">{d.tableDate}</th>
                  <th className="px-4 py-3 text-right">{d.tableValue}</th>
                  <th className="px-4 py-3 text-right">{d.tableChange}</th>
                  <th className="px-4 py-3 text-right">{d.tableDiff}</th>
                  <th className="px-4 py-3 text-left">{d.tableNotes}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--arvo-border-soft)]">
                {mvEntriesWithChange.map(e => (
                  <tr key={e.id} className="hover:bg-[var(--arvo-surface-2)]">
                    <td className="px-4 py-3 text-[var(--arvo-fg-muted)]">{fmtDate(e.ref_date, intlLocale)}</td>
                    <td className="px-4 py-3 text-right font-medium text-[var(--arvo-fg)]">
                      {new Intl.NumberFormat(intlLocale, { style: 'currency', currency: e.currency, maximumFractionDigits: 2 }).format(e.value)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {e.changePct != null ? (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          e.changePct > 0 ? 'bg-green-100 text-green-700' :
                          e.changePct < 0 ? 'bg-red-100 text-red-700' : 'bg-[var(--arvo-track-bg)] text-[var(--arvo-fg-muted)]'
                        }`}>
                          {e.changePct >= 0 ? '+' : ''}{e.changePct.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--arvo-fg-soft)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--arvo-fg-muted)] text-xs">
                      {e.changeAbs != null
                        ? `${e.changeAbs >= 0 ? '+' : ''}${new Intl.NumberFormat(intlLocale, { style: 'currency', currency: e.currency, maximumFractionDigits: 2 }).format(e.changeAbs)}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--arvo-fg-soft)] italic">{e.notes ?? ''}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleDeleteManualValue(e.id)}
                        className="text-[var(--arvo-fg-faint)] hover:text-red-500 transition-colors text-base leading-none"
                        title={d.removeEntry}
                      >×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* mobile cards */}
          <div className="sm:hidden divide-y divide-[var(--arvo-border-soft)]">
            {mvEntriesWithChange.map(e => (
              <div key={e.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-[var(--arvo-fg)]">
                      {new Intl.NumberFormat(intlLocale, { style: 'currency', currency: e.currency, maximumFractionDigits: 2 }).format(e.value)}
                    </div>
                    <div className="text-xs text-[var(--arvo-fg-muted)] mt-0.5">{fmtDate(e.ref_date, intlLocale)}</div>
                    {e.notes && <div className="text-xs text-[var(--arvo-fg-soft)] italic mt-0.5">{e.notes}</div>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {e.changePct != null && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        e.changePct > 0 ? 'bg-green-100 text-green-700' :
                        e.changePct < 0 ? 'bg-red-100 text-red-700' : 'bg-[var(--arvo-track-bg)] text-[var(--arvo-fg-muted)]'
                      }`}>
                        {e.changePct >= 0 ? '+' : ''}{e.changePct.toFixed(2)}%
                      </span>
                    )}
                    <button
                      onClick={() => handleDeleteManualValue(e.id)}
                      className="text-[var(--arvo-fg-faint)] hover:text-red-500 transition-colors text-lg leading-none"
                      title={d.removeEntry}
                    >×</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contributions history — hidden for manual assets */}
      {!isManual && (() => {
        const currentPriceBrl = data.asset_type === 'ticker' && data.holdings != null && data.holdings > 0 && data.current_value_brl > 0
          ? data.current_value_brl / data.holdings
          : null

        return (
          <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-[var(--arvo-border)]">
              <h2 className="font-semibold text-[var(--arvo-fg)]">
                {d.contribTitle}{contributions.length > 0 ? ` (${contributions.length})` : ''}
              </h2>
            </div>
            {contributions.length === 0 ? (
              <p className="text-center text-[var(--arvo-fg-soft)] py-8 text-sm">
                {t.contributions.noContributions}
              </p>
            ) : (
              <>
                {/* desktop */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--arvo-surface-2)] text-[var(--arvo-fg-muted)] text-xs uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">{d.tableDate}</th>
                        <th className="px-4 py-3 text-left">{d.tableType}</th>
                        <th className="px-4 py-3 text-right">{d.tableQty}</th>
                        <th className="px-4 py-3 text-right">{d.tableUnitPrice}</th>
                        <th className="px-4 py-3 text-right">{d.tableTotal} {currency}</th>
                        <th className="px-4 py-3 text-right">{d.tableProfit}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--arvo-border-soft)]">
                      {contributions.map(c => {
                        const totalBrlVal = c.value_brl ?? (c.price_orig != null
                          ? c.price_orig * c.quantity * (c.fx_rate_brl ?? 1)
                          : null)

                        const profitBrl = c.profit_brl != null
                          ? c.profit_brl
                          : (data.asset_type === 'ticker' && c.type === 'buy' && currentPriceBrl != null && totalBrlVal != null
                            ? c.quantity * currentPriceBrl - totalBrlVal
                            : null)

                        return (
                          <tr key={c.id} className="hover:bg-[var(--arvo-surface-2)]">
                            <td className="px-4 py-3 text-[var(--arvo-fg-muted)]">{fmtDate(c.date, intlLocale)}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                c.type === 'buy'    ? 'bg-green-100 text-green-700' :
                                c.type === 'income' ? 'bg-purple-100 text-purple-700' :
                                                      'bg-red-100 text-red-700'
                              }`}>
                                {c.type === 'buy'
                                  ? t.contributions.buyLabel
                                  : c.type === 'income'
                                  ? t.contributions.incomeLabel
                                  : t.contributions.sellLabel}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-[var(--arvo-fg)]">{fmtNum(c.quantity, 6, intlLocale)}</td>
                            <td className="px-4 py-3 text-right text-[var(--arvo-fg-muted)]">
                              {c.price_orig != null && c.currency
                                ? `${c.currency} ${fmtNum(c.price_orig, 4, intlLocale)}`
                                : '—'}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-[var(--arvo-fg)]">
                              {totalBrlVal != null ? fmt(convert(totalBrlVal)) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {profitBrl != null ? (
                                <div>
                                  <span className={`text-xs font-semibold ${profitBrl >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                    {profitBrl >= 0 ? '+' : ''}{fmt(profitBrl)}
                                  </span>
                                  {totalBrlVal != null && totalBrlVal > 0 && (
                                    <div className={`text-[10px] ${profitBrl >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                      {profitBrl >= 0 ? '+' : ''}{((profitBrl / totalBrlVal) * 100).toFixed(1)}%
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-[var(--arvo-fg-soft)]">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {/* mobile cards */}
                <div className="sm:hidden divide-y divide-[var(--arvo-border-soft)]">
                  {contributions.map(c => {
                    const totalBrlVal = c.value_brl ?? (c.price_orig != null
                      ? c.price_orig * c.quantity * (c.fx_rate_brl ?? 1)
                      : null)
                    const profitBrl = c.profit_brl != null
                      ? c.profit_brl
                      : (data.asset_type === 'ticker' && c.type === 'buy' && currentPriceBrl != null && totalBrlVal != null
                        ? c.quantity * currentPriceBrl - totalBrlVal
                        : null)
                    return (
                      <div key={c.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              c.type === 'buy'    ? 'bg-green-100 text-green-700' :
                              c.type === 'income' ? 'bg-purple-100 text-purple-700' :
                                                    'bg-red-100 text-red-700'
                            }`}>
                              {c.type === 'buy' ? t.contributions.buyLabel : c.type === 'income' ? t.contributions.incomeLabel : t.contributions.sellLabel}
                            </span>
                            <div className="text-xs text-[var(--arvo-fg-muted)] mt-1">{fmtDate(c.date, intlLocale)}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-medium text-sm text-[var(--arvo-fg)]">{totalBrlVal != null ? fmt(convert(totalBrlVal)) : '—'}</div>
                            {profitBrl != null && (
                              <div>
                                <div className={`text-xs font-semibold ${profitBrl >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                  {profitBrl >= 0 ? '+' : ''}{fmt(profitBrl)}
                                </div>
                                {totalBrlVal != null && totalBrlVal > 0 && (
                                  <div className={`text-[10px] ${profitBrl >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                    {profitBrl >= 0 ? '+' : ''}{((profitBrl / totalBrlVal) * 100).toFixed(1)}%
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )
      })()}

      {/* Dividend history — only for ticker assets */}
      {data.asset_type === 'ticker' && (
        <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-[var(--arvo-border)] flex items-center justify-between">
            <h2 className="font-semibold text-[var(--arvo-fg)]">
              {td.history ?? 'Dividendos Recebidos'}
              {assetDividends.length > 0 && (
                <span className="ml-2 text-xs text-[var(--arvo-fg-soft)] font-normal">({assetDividends.length} {td.count ?? 'pagamentos'})</span>
              )}
            </h2>
            {assetDividends.length > 0 && (
              <span className="text-sm font-bold text-green-600">
                {fmt(convert(assetDividends.reduce((s, r) => s + (r.amount_brl ?? 0), 0)))}
              </span>
            )}
          </div>
          {divLoading ? (
            <div className="text-center text-[var(--arvo-fg-soft)] py-8 text-sm animate-pulse">{td.syncing ?? 'Carregando...'}</div>
          ) : assetDividends.length === 0 ? (
            <p className="text-center text-[var(--arvo-fg-soft)] py-8 text-sm">{td.noData ?? 'Nenhum dividendo registrado'}</p>
          ) : (
            <>
              {/* desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--arvo-surface-2)] text-[var(--arvo-fg-muted)] text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">{td.colExDate ?? 'Data EX'}</th>
                      <th className="px-4 py-3 text-left">{td.colPayDate ?? 'Pagamento'}</th>
                      <th className="px-4 py-3 text-left">{td.colType ?? 'Tipo'}</th>
                      <th className="px-4 py-3 text-right">{td.colPerShare ?? 'Por cota'}</th>
                      <th className="px-4 py-3 text-right">{td.colTotal ?? 'Total recebido'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--arvo-border-soft)]">
                    {assetDividends.map(div => (
                      <tr key={div.id} className="hover:bg-[var(--arvo-surface-2)]">
                        <td className="px-4 py-3 text-[var(--arvo-fg)]">{fmtDate(div.ex_date, intlLocale)}</td>
                        <td className="px-4 py-3 text-[var(--arvo-fg-muted)]">{div.pay_date ? fmtDate(div.pay_date, intlLocale) : '—'}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                            {div.dividend_type === 'jcp' ? (td.typeJcp ?? 'JCP') :
                             div.dividend_type === 'rendimento' ? (td.typeRendimento ?? 'Rendimento') :
                             div.dividend_type === 'amortization' ? (td.typeAmortization ?? 'Amortização') :
                             (td.typeDividend ?? 'Dividendo')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-[var(--arvo-fg)]">
                          {div.currency} {fmtNum(div.amount_per_share, 6, intlLocale)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-green-600">
                          {fmt(convert(div.amount_brl ?? 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* mobile cards */}
              <div className="sm:hidden divide-y divide-[var(--arvo-border-soft)]">
                {assetDividends.map(div => (
                  <div key={div.id} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                        {div.dividend_type === 'jcp' ? (td.typeJcp ?? 'JCP') :
                         div.dividend_type === 'rendimento' ? (td.typeRendimento ?? 'Rendimento') :
                         (td.typeDividend ?? 'Dividendo')}
                      </span>
                      <span className="font-bold text-green-600">{fmt(convert(div.amount_brl ?? 0))}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-[var(--arvo-fg-muted)]">
                      <span>EX: {fmtDate(div.ex_date, intlLocale)}</span>
                      <span>{div.currency} {fmtNum(div.amount_per_share, 6, intlLocale)} / cota</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
