import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageLoader } from '../components/ArvoLoader'
import { usePortfolioValue, usePerformanceInception, usePerformanceSummary, useAssetReturns, clearPerfCache } from '../hooks/usePortfolio'
import { useDividendSummary, useDividendSync } from '../hooks/useDividends'
import { useCurrency } from '../contexts/CurrencyContext'
import { useAchievementContext } from '../contexts/AchievementContext'
import { useNotificationsContext } from '../contexts/NotificationsContext'
import { useI18n } from '../contexts/I18nContext'
import { apiFetch } from '../lib/api'
import ValueCards from '../components/ValueCards'
import AllocationChart from '../components/AllocationChart'
import MarketIndicesCard from '../components/MarketIndicesCard'
import DividendsCard from '../components/DividendsCard'
import { PageTitle, Segmented, Button, Banner } from '../components/ui'
import { Icon } from '../components/icons'

type PeriodMode = 'last_5d' | 'current_month' | 'last_30d' | 'last_12m' | 'ytd' | 'inception'

function localYM(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return localYM(d)
}

export default function DashboardPage() {
  const { data, loading, error, refresh } = usePortfolioValue()
  const navigate = useNavigate()
  const { triggerCheck } = useAchievementContext()

  const { convert, fmt, currency } = useCurrency()
  const { t, locale } = useI18n()
  const intlLocale = locale === 'pt' ? 'pt-BR' : locale === 'fr' ? 'fr-FR' : 'en-GB'
  const td = (t as unknown as Record<string, Record<string, string>>).dividends ?? {}
  const { active: activeNotifications, dismiss: dismissNotification } = useNotificationsContext()
  const splitWarnings = activeNotifications.filter(i => i.type === 'split_warning')

  useEffect(() => {
    if (data?.total_brl != null) triggerCheck(data.total_brl)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.total_brl])

  const inception = usePerformanceInception()
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentYM = localYM(now)

  const { sync: syncDividends, syncing } = useDividendSync()
  const divSyncFired = useRef(false)
  useEffect(() => {
    if (divSyncFired.current) return
    divSyncFired.current = true
    syncDividends()
  }, [syncDividends])


  const [periodMode, setPeriodMode] = useState<PeriodMode>('ytd')

  // Share modal
  const [showShareModal, setShowShareModal] = useState(false)
  const [shareLink, setShareLink] = useState<{ token: string; show_values: boolean; hide_holdings: boolean; updated_at?: string } | null>(null)
  const [shareShowValues, setShareShowValues] = useState(false)
  const [shareHideHoldings, setShareHideHoldings] = useState(false)
  const [sharePeriod, setSharePeriod] = useState<'inception' | '12m' | 'ytd'>('inception')
  const [shareLoading, setShareLoading] = useState(false)
  const [shareSuccess, setShareSuccess] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [progressDone, setProgressDone] = useState(false)

  useEffect(() => {
    if (!showShareModal) return
    apiFetch<{ token: string; show_values: boolean; hide_holdings: boolean; updated_at: string } | null>('/portfolio/share-link')
      .then(r => {
        if (r) {
          setShareLink(r)
          setShareShowValues(r.show_values)
          setShareHideHoldings(r.hide_holdings ?? false)
        }
      })
      .catch(() => {})
  }, [showShareModal])

  async function handleToggleShowValues() {
    const newVal = !shareShowValues
    setShareShowValues(newVal)
    if (shareLink) {
      apiFetch('/portfolio/share-link', { method: 'PATCH', body: JSON.stringify({ show_values: newVal }) })
        .catch(() => {})
    }
  }

  async function handleToggleHideHoldings() {
    const newVal = !shareHideHoldings
    setShareHideHoldings(newVal)
    if (shareLink) {
      apiFetch('/portfolio/share-link', { method: 'PATCH', body: JSON.stringify({ hide_holdings: newVal }) })
        .catch(() => {})
    }
  }

  async function handleGenerateShare() {
    setShareLoading(true)
    setShareSuccess(false)
    try {
      const r = await apiFetch<{ token: string; show_values: boolean; hide_holdings: boolean; updated_at: string }>('/portfolio/share-link', {
        method: 'POST', body: JSON.stringify({
          show_values: shareShowValues, hide_holdings: shareHideHoldings, period: sharePeriod, display_currency: currency,
          portfolio_value: data ? {
            total_brl: data.total_brl,
            by_asset: data.by_asset.map(a => ({
              id: a.id, code: a.code, name: a.name,
              value_brl: a.value_brl, currency: a.currency,
              class_name: a.class_name, class_name_key: a.class_name_key ?? null, class_color: a.class_color,
              exchange: a.exchange ?? null, source: a.source, invested_brl: a.invested_brl ?? null,
            })),
            by_class: data.by_class,
          } : undefined,
        }),
      })
      setShareLink(r)
      setShareSuccess(true)
      setTimeout(() => setShareSuccess(false), 5000)
    } finally {
      setProgressDone(true)
      setTimeout(() => setProgressDone(false), 700)
      setShareLoading(false)
    }
  }

  async function handleDeactivateShare() {
    try {
      await apiFetch('/portfolio/share-link', { method: 'DELETE' })
    } catch { /* ignore */ }
    setShareLink(null)
  }

  function copyShareLink() {
    if (!shareLink) return
    navigator.clipboard.writeText(`${window.location.origin}/share/portfolio/${shareLink.token}`)
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2000)
  }

  const s = t.sharePortfolio

  const perfFrom = (() => {
    switch (periodMode) {
      case 'last_5d':        { const d = new Date(); d.setDate(d.getDate() - 5); return localDateStr(d) }
      case 'current_month': return currentYM
      case 'last_30d':      { const d = new Date(); d.setDate(d.getDate() - 30); return localDateStr(d) }
      case 'last_12m':      return addMonths(currentYM, -11)
      case 'ytd':           return `${currentYear}-01`
      case 'inception':     return inception ?? `${currentYear}-01`
    }
  })()
  const perfTo = (periodMode === 'last_5d' || periodMode === 'last_30d') ? localDateStr(now) : currentYM

  const periodLabel = (() => {
    switch (periodMode) {
      case 'last_5d':        return t.performance.last5d
      case 'current_month': return t.performance.currentMonth
      case 'last_30d':      return t.performance.last30d
      case 'last_12m':      return t.performance.last12m
      case 'ytd':           return 'YTD'
      case 'inception':     return t.performance.inception
    }
  })()

  const { data: periodSummary, loading: periodLoading, refresh: refreshPeriodSummary } = usePerformanceSummary(perfFrom, perfTo)
  const periodReturnPct = periodSummary?.return_pct ?? null
  const periodReturnAbs = periodSummary?.return_abs ?? null

  const { data: dashReturns, loading: dashReturnsLoading } = useAssetReturns(perfFrom, perfTo)

  const divFrom = (() => {
    switch (periodMode) {
      case 'last_5d':   { const d = new Date(); d.setDate(d.getDate() - 5); return d.toISOString().split('T')[0] }
      case 'current_month': return `${currentYM}-01`
      case 'last_30d': { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().split('T')[0] }
      case 'last_12m': { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().split('T')[0] }
      case 'ytd':      return `${currentYear}-01-01`
      case 'inception': return inception ? `${inception}-01` : `${currentYear}-01-01`
    }
  })()
  const divTo = now.toISOString().split('T')[0]
  const { data: divSummary, loading: divLoading } = useDividendSummary(divFrom, divTo)

  const refreshPeriodSummaryRef = useRef(refreshPeriodSummary)
  refreshPeriodSummaryRef.current = refreshPeriodSummary

  const priceSyncFired = useRef(false)
  useEffect(() => {
    if (priceSyncFired.current) return
    const INTERVAL = 6 * 60 * 60 * 1000
    const lastSync = localStorage.getItem('price_last_sync')
    if (lastSync && Date.now() - new Date(lastSync).getTime() < INTERVAL) return
    priceSyncFired.current = true
    apiFetch('/portfolio/sync-history', { method: 'POST' })
      .then(() => {
        localStorage.setItem('price_last_sync', new Date().toISOString())
        clearPerfCache()
        refreshPeriodSummaryRef.current()
      })
      .catch(() => {})
  }, [])

  if (loading) return <PageLoader />

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300">
        <p className="font-medium">{t.dashboard.errorLoadingPortfolio}</p>
        <p className="text-sm mt-1">{error}</p>
        <button onClick={refresh} className="mt-3 text-sm underline">{t.dashboard.tryAgain}</button>
      </div>
    )
  }

  if (!data) return null

  const tdd = t.dashboard as unknown as Record<string, string>
  const movingAssets = (data.by_asset ?? [])
    .filter(a => !a.needs_manual && a.source !== 'manual' && a.value_brl > 0 && dashReturns?.[a.id] != null)
    .map(a => ({ ...a, ret: dashReturns![a.id]! }))
    .sort((a, b) => b.ret - a.ret)
  const gainers = movingAssets.filter(a => a.ret > 0).slice(0, 5)
  const losers  = [...movingAssets].reverse().filter(a => a.ret < 0).slice(0, 5)
  const hasAllocation = data.by_class.length > 0
  const hasMovers = dashReturnsLoading || gainers.length > 0 || losers.length > 0
  const hasDividends = divLoading || (divSummary != null && divSummary.total_brl > 0)
  const yieldPct = (data.total_brl > 0 && divSummary?.total_brl)
    ? Math.round(divSummary.total_brl / data.total_brl * 10000) / 100
    : null

  return (
    <>
    <div className="space-y-6">
      {/* Header + controls */}
      <PageTitle
        eyebrow={t.dashboard.eyebrow}
        title="Dashboard"
        actions={
          <>
            <div className="w-full sm:w-auto">
              <Segmented
                ariaLabel={t.archived.period}
                value={periodMode}
                onChange={setPeriodMode}
                options={[
                  { value: 'last_5d'       as PeriodMode, label: t.performance.last5d },
                  { value: 'current_month' as PeriodMode, label: t.performance.currentMonth },
                  { value: 'last_30d'      as PeriodMode, label: t.performance.last30d },
                  { value: 'last_12m'      as PeriodMode, label: t.performance.last12m },
                  { value: 'ytd'           as PeriodMode, label: 'YTD' },
                  { value: 'inception'     as PeriodMode, label: t.performance.inception, disabled: !inception },
                ]}
              />
            </div>
            <button
              onClick={refresh}
              aria-label={t.dashboard.refresh}
              title={t.dashboard.refresh}
              className="arvo-btn arvo-btn--ghost"
              style={{ width: 32, height: 32, padding: 0 }}
            >
              <Icon name="refresh" size={14} />
            </button>
            <Button variant="ghost" size="sm" onClick={() => setShowShareModal(true)}>
              <Icon name="share" size={12} />
              {s.btnShare}
            </Button>
          </>
        }
      />

      {/* Split warning — single banner (D9); dismiss advances to the next item */}
      {splitWarnings.length > 0 && (() => {
        const item = splitWarnings[0]
        const assetId = item.key.split(':')[1]
        return (
          <Banner
            variant="alert"
            onDismiss={() => dismissNotification(item)}
            action={
              <button
                onClick={() => navigate(`/assets/${assetId}`, { state: { total_brl: data.total_brl } })}
                className="arvo-btn arvo-btn--link shrink-0"
              >
                {item.params.code as string} · {item.params.ratio as string} →
              </button>
            }
          >
            {(t.dashboard.splitWarningDashBody as string).replace('{n}', String(splitWarnings.length))}
          </Banner>
        )
      })()}

      {/* Row 1: ValueCards + MarketIndicesCard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {(() => {
            const totalInvestedBrl = data.by_asset.reduce((s, a) => s + (a.invested_brl ?? 0), 0)
            const hasInvested = totalInvestedBrl > 0
            const gainLossBrl = hasInvested ? data.total_brl - totalInvestedBrl : null
            const gainLossPct = hasInvested && gainLossBrl != null ? (gainLossBrl / totalInvestedBrl) * 100 : null
            return (
              <ValueCards
                total_brl={data.total_brl}
                generated_at={data.generated_at}
                invested_brl={hasInvested ? totalInvestedBrl : null}
                gain_brl={gainLossBrl}
                gain_pct={gainLossPct}
                period_abs={hasInvested ? periodReturnAbs : null}
                chartLoading={periodLoading}
                period_pct={hasInvested ? periodReturnPct : null}
                period_label={periodLabel}
              />
            )
          })()}
        </div>
        <div className="lg:col-span-1">
          <MarketIndicesCard periodMode={periodMode} periodLabel={periodLabel} />
        </div>
      </div>

      {/* Row 2: AllocationChart + Top movers + Dividends (2xl bento) */}
      {(hasAllocation || hasMovers || hasDividends) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-12 gap-6 items-stretch">
          {hasAllocation && (
            <div className={`${hasMovers ? '' : 'lg:col-span-2'} 2xl:col-span-5`}>
              <AllocationChart data={data.by_class} currency={currency} convert={convert} />
            </div>
          )}
          {hasMovers && (
          <div className={`${hasAllocation ? '' : 'lg:col-span-2'} 2xl:col-span-4`}>
          <div className="rounded-2xl p-5 h-full flex flex-col" style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)' }}>
          <h2 className="mb-3" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--arvo-fg)' }}>
            {tdd.topMovers} · {periodLabel}
          </h2>
          {dashReturnsLoading ? (
            <div className="h-12 flex items-center">
              <div className="text-xs animate-pulse" style={{ color: 'var(--arvo-fg-faint)' }}>...</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {gainers.length > 0 && (
                <div>
                  <p className="text-xs mb-2" style={{ fontFamily: 'var(--arvo-font-body)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }}>{tdd.topGainers}</p>
                  <div className="space-y-2">
                    {gainers.map(a => (
                      <div key={a.id}
                        className="flex items-center justify-between gap-2 cursor-pointer rounded-xl px-3 py-2 transition-colors"
                        style={{ background: 'rgba(31,138,91,0.06)', border: '1px solid rgba(31,138,91,0.15)' }}
                        onClick={() => navigate(`/assets/${a.id}`, { state: { total_brl: data.total_brl } })}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold" style={{ color: 'var(--arvo-fg)' }}>{a.code}</div>
                          <div className="text-xs truncate" style={{ color: 'var(--arvo-fg-soft)' }}>{a.name}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold" style={{ color: 'var(--arvo-green)' }}>+{a.ret.toFixed(2)}%</div>
                          <div className="text-xs" style={{ color: 'var(--arvo-fg-soft)' }}>{fmt(convert(a.value_brl))}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {losers.length > 0 && (
                <div>
                  <p className="text-xs mb-2" style={{ fontFamily: 'var(--arvo-font-body)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }}>{tdd.topLosers}</p>
                  <div className="space-y-2">
                    {losers.map(a => (
                      <div key={a.id}
                        className="flex items-center justify-between gap-2 cursor-pointer rounded-xl px-3 py-2 transition-colors"
                        style={{ background: 'rgba(214,59,47,0.06)', border: '1px solid rgba(214,59,47,0.15)' }}
                        onClick={() => navigate(`/assets/${a.id}`, { state: { total_brl: data.total_brl } })}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold" style={{ color: 'var(--arvo-fg)' }}>{a.code}</div>
                          <div className="text-xs truncate" style={{ color: 'var(--arvo-fg-soft)' }}>{a.name}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold" style={{ color: 'var(--arvo-red)' }}>{a.ret.toFixed(2)}%</div>
                          <div className="text-xs" style={{ color: 'var(--arvo-fg-soft)' }}>{fmt(convert(a.value_brl))}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {data.by_asset.length > 0 && (
            <div className="flex justify-end mt-auto pt-3">
              <button
                onClick={() => navigate('/assets')}
                style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.10em', color: 'var(--arvo-fg-soft)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                {t.nav.assets} ({data.by_asset.length})
                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
          </div>
          </div>
          )}
          {hasDividends && (
            <div className="hidden 2xl:block 2xl:col-span-3">
              <DividendsCard
                vertical
                divLoading={divLoading}
                divSummary={divSummary}
                syncing={syncing}
                convert={convert}
                fmt={fmt}
                currency={currency}
                intlLocale={intlLocale}
                periodLabel={periodLabel}
                td={td}
                yieldPct={yieldPct}
              />
            </div>
          )}
        </div>
      )}

      {/* Link to assets page (fallback when Top Movers card isn't shown) */}
      {!hasMovers && data.by_asset.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={() => navigate('/assets')}
            style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.10em', color: 'var(--arvo-fg-soft)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            {t.nav.assets} ({data.by_asset.length})
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}

      {/* Dividends — footer strip below 2xl (becomes a bento column at 2xl) */}
      {hasDividends && (
        <div className="2xl:hidden">
          <DividendsCard
            divLoading={divLoading}
            divSummary={divSummary}
            syncing={syncing}
            convert={convert}
            fmt={fmt}
            currency={currency}
            intlLocale={intlLocale}
            periodLabel={periodLabel}
            td={td}
            yieldPct={yieldPct}
          />
        </div>
      )}
    </div>

      {/* ── Share modal ── */}
      {showShareModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setShowShareModal(false) }}>
          <div style={{ background: 'var(--arvo-surface)', borderRadius: 16, padding: '28px', width: '100%', maxWidth: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div>
                <h2 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 18, fontWeight: 400, margin: 0, color: 'var(--arvo-fg)' }}>{s.title}</h2>
                <p style={{ fontSize: 12, color: 'var(--arvo-fg-soft)', margin: '4px 0 0', lineHeight: 1.4 }}>{s.subtitle}</p>
              </div>
              <button onClick={() => setShowShareModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--arvo-fg-soft)', padding: 4, lineHeight: 1 }}>✕</button>
            </div>

            <div style={{ height: 1, background: 'var(--arvo-border)', margin: '18px 0' }} />

            {/* Show values toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--arvo-fg)' }}>{s.showValues}</div>
                <div style={{ fontSize: 11, color: 'var(--arvo-fg-soft)', marginTop: 2 }}>{s.showValuesHint}</div>
              </div>
              <button
                onClick={handleToggleShowValues}
                style={{ width: 40, height: 22, borderRadius: 11, background: shareShowValues ? '#1B4FD8' : '#D1D5DB', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
              >
                <div style={{ position: 'absolute', top: 3, left: shareShowValues ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </button>
            </div>

            {/* Hide holdings toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--arvo-fg)' }}>{s.hideHoldings}</div>
                <div style={{ fontSize: 11, color: 'var(--arvo-fg-soft)', marginTop: 2 }}>{s.hideHoldingsHint}</div>
              </div>
              <button
                onClick={handleToggleHideHoldings}
                style={{ width: 40, height: 22, borderRadius: 11, background: shareHideHoldings ? '#1B4FD8' : '#D1D5DB', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
              >
                <div style={{ position: 'absolute', top: 3, left: shareHideHoldings ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </button>
            </div>

            {/* Period selector */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--arvo-fg-soft)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{s.periodLabel}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['inception', '12m', 'ytd'] as const).map(p => {
                  const label = p === 'inception' ? s.periodInception : p === '12m' ? s.period12m : s.periodYtd
                  const active = sharePeriod === p
                  return (
                    <button
                      key={p}
                      onClick={() => setSharePeriod(p)}
                      style={{ flex: 1, padding: '7px 4px', borderRadius: 8, border: `1px solid ${active ? '#1B4FD8' : 'var(--arvo-border)'}`, background: active ? 'rgba(27,79,216,0.08)' : 'var(--arvo-surface-2)', color: active ? '#1B4FD8' : 'var(--arvo-fg-soft)', fontSize: 11, fontFamily: 'var(--arvo-font-body)', cursor: 'pointer', fontWeight: active ? 600 : 400, transition: 'all 0.15s' }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* "Atualizar dados" — prominent CTA */}
            <button
              onClick={handleGenerateShare}
              disabled={shareLoading}
              style={{ width: '100%', padding: '12px 16px', background: shareLoading ? 'rgba(13,13,13,0.5)' : '#0D0D0D', color: '#F4F3F1', border: 'none', borderRadius: 10, fontSize: 13, fontFamily: 'var(--arvo-font-body)', letterSpacing: '0.04em', cursor: shareLoading ? 'default' : 'pointer', marginBottom: shareLoading ? 6 : 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background 0.2s' }}
            >
              <svg style={{ width: 13, height: 13, animation: shareLoading ? 'arvo-spin 1s linear infinite' : 'none' }} fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 8A7 7 0 1 0 8 1M1 1v4h4"/>
              </svg>
              {shareLoading ? s.refreshing : shareLink ? s.refresh : s.generate}
            </button>
            {(shareLoading || progressDone) && (
              <div style={{ height: 3, background: 'var(--arvo-border)', borderRadius: 2, overflow: 'hidden', marginBottom: 14 }}>
                <div style={{
                  height: '100%', background: 'var(--arvo-gold)', borderRadius: 2,
                  ...(progressDone
                    ? { width: '100%', transition: 'width 0.25s ease-in' }
                    : { animation: 'arvo-progress 60s ease-out forwards' }),
                }} />
              </div>
            )}
            {shareSuccess && !shareLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 14 }}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 8l4 4 8-8"/></svg>
                <span style={{ fontSize: 12, color: '#16A34A', fontFamily: 'var(--arvo-font-body)' }}>{s.dataUpdated}</span>
              </div>
            )}

            {/* Dados de {date} — always visible */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: shareLink ? 14 : 0, padding: '8px 12px', background: 'var(--arvo-surface-2)', borderRadius: 8, border: '1px solid var(--arvo-border)' }}>
              <svg style={{ width: 12, height: 12, flexShrink: 0, color: 'var(--arvo-fg-soft)' }} fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5">
                <rect x="1" y="3" width="14" height="12" rx="2"/><path d="M1 7h14M5 1v4M11 1v4"/>
              </svg>
              <span style={{ fontSize: 11, color: 'var(--arvo-fg-soft)' }}>
                {s.updatedAt}{' '}
                {shareLink?.updated_at
                  ? new Date(shareLink.updated_at).toLocaleDateString(locale === 'fr' ? 'fr-FR' : locale === 'en' ? 'en-GB' : 'pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : '—'}
              </span>
            </div>

            {/* Link area */}
            {shareLink && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--arvo-fg-soft)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{s.linkLabel}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1, background: 'var(--arvo-surface-2)', border: '1px solid var(--arvo-border)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--arvo-fg-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {window.location.origin}/share/portfolio/{shareLink.token}
                  </div>
                  <button onClick={copyShareLink} style={{ padding: '8px 14px', background: shareCopied ? '#16A34A' : 'var(--arvo-pill-active-bg)', color: shareCopied ? '#fff' : 'var(--arvo-pill-active-fg)', border: 'none', borderRadius: 8, fontSize: 12, cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s' }}>
                    {shareCopied ? s.copied : s.copy}
                  </button>
                </div>
              </div>
            )}

            {/* Secondary actions */}
            {shareLink && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a
                  href={`/share/portfolio/${shareLink.token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ padding: '9px 14px', background: 'var(--arvo-chip-bg)', color: 'var(--arvo-fg)', border: 'none', borderRadius: 8, fontSize: 12, fontFamily: 'var(--arvo-font-body)', cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  <svg style={{ width: 12, height: 12 }} fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V9M9 1h6v6M15 1L7.5 8.5"/>
                  </svg>
                  {s.openReport}
                </a>
                <a
                  href={`/share/portfolio/${shareLink.token}?print=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ padding: '9px 14px', background: 'var(--arvo-chip-bg)', color: 'var(--arvo-fg)', border: 'none', borderRadius: 8, fontSize: 12, fontFamily: 'var(--arvo-font-body)', cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  <svg style={{ width: 12, height: 12 }} fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 2v8M5 7l3 3 3-3M3 12h10"/>
                  </svg>
                  {s.downloadPdf}
                </a>
                <button
                  onClick={handleDeactivateShare}
                  style={{ padding: '9px 14px', background: 'rgba(220,38,38,0.12)', color: '#DC2626', border: 'none', borderRadius: 8, fontSize: 12, cursor: 'pointer', marginLeft: 'auto' }}
                >
                  {s.deactivate}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
