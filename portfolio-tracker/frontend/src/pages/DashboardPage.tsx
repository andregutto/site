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
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

type PeriodMode = 'current_month' | 'last_30d' | 'last_12m' | 'ytd' | 'inception'

function localYM(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
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
  const [shareLink, setShareLink] = useState<{ token: string; show_values: boolean; updated_at?: string } | null>(null)
  const [shareShowValues, setShareShowValues] = useState(false)
  const [shareLoading, setShareLoading] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)

  useEffect(() => {
    if (!showShareModal) return
    apiFetch<{ token: string; show_values: boolean; updated_at: string } | null>('/portfolio/share-link')
      .then(r => { if (r) { setShareLink(r); setShareShowValues(r.show_values) } })
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

  async function handleGenerateShare() {
    setShareLoading(true)
    try {
      const r = await apiFetch<{ token: string; show_values: boolean; updated_at: string }>('/portfolio/share-link', {
        method: 'POST', body: JSON.stringify({ show_values: shareShowValues, display_currency: currency }),
      })
      setShareLink(r)
    } finally { setShareLoading(false) }
  }

  async function handleDeactivateShare() {
    await apiFetch('/portfolio/share-link', { method: 'DELETE' })
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
      case 'current_month': return currentYM
      case 'last_30d':      return addMonths(currentYM, -1)
      case 'last_12m':      return addMonths(currentYM, -11)
      case 'ytd':           return `${currentYear}-01`
      case 'inception':     return inception ?? `${currentYear}-01`
    }
  })()
  const perfTo = currentYM

  const periodLabel = (() => {
    switch (periodMode) {
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

  return (
    <>
    <div className="space-y-6">
      {/* Header + period buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 18, letterSpacing: '0.06em', color: 'var(--arvo-fg)' }}>Dashboard</h1>
        <div className="flex flex-wrap items-center gap-2">
          {([
            { key: 'current_month' as PeriodMode, label: t.performance.currentMonth },
            { key: 'last_30d'      as PeriodMode, label: t.performance.last30d },
            { key: 'last_12m'      as PeriodMode, label: t.performance.last12m },
            { key: 'ytd'           as PeriodMode, label: 'YTD' },
            { key: 'inception'     as PeriodMode, label: t.performance.inception, disabled: !inception },
          ] as Array<{ key: PeriodMode; label: string; disabled?: boolean }>).map(({ key, label, disabled }) => (
            <button
              key={key}
              onClick={() => !disabled && setPeriodMode(key)}
              disabled={disabled}
              style={{
                fontFamily: 'var(--arvo-font-body)', fontSize: 10, letterSpacing: '0.12em',
                textTransform: 'uppercase', padding: '6px 12px', borderRadius: 6,
                border: `1px solid ${disabled ? 'var(--arvo-border-soft)' : periodMode === key ? 'var(--arvo-pill-active-bg)' : 'var(--arvo-border)'}`,
                background: periodMode === key && !disabled ? 'var(--arvo-pill-active-bg)' : 'var(--arvo-surface)',
                color: disabled ? 'var(--arvo-fg-faint)' : periodMode === key ? 'var(--arvo-pill-active-fg)' : 'var(--arvo-fg-muted)',
                cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
              }}
            >{label}</button>
          ))}
          <button
            onClick={refresh}
            style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {t.dashboard.refresh}
          </button>
          <button
            onClick={() => setShowShareModal(true)}
            style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase', padding: '6px 12px', borderRadius: 6, border: '1px solid var(--arvo-border)', background: 'var(--arvo-surface)', color: 'var(--arvo-fg-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <svg style={{ width: 12, height: 12 }} fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5">
              <circle cx="13" cy="3" r="1.5"/><circle cx="3" cy="8" r="1.5"/><circle cx="13" cy="13" r="1.5"/>
              <path strokeLinecap="round" d="M4.3 7.3l7.4-3.6M4.3 8.7l7.4 3.6"/>
            </svg>
            {s.btnShare}
          </button>
        </div>
      </div>

      {/* Split warnings */}
      {splitWarnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 dark:bg-amber-950/40 dark:border-amber-900">
          <span className="text-amber-500 text-lg shrink-0">⚠</span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-amber-900 text-sm dark:text-amber-200">{t.dashboard.splitWarningDashTitle}</p>
            <p className="text-xs text-amber-700 mt-0.5 dark:text-amber-300">{(t.dashboard.splitWarningDashBody as string).replace('{n}', String(splitWarnings.length))}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {splitWarnings.map(item => {
                const assetId = item.key.split(':')[1]
                return (
                  <div key={item.key} className="flex items-center gap-1 bg-amber-100 border border-amber-300 rounded-lg dark:bg-amber-900/40 dark:border-amber-800">
                    <button
                      onClick={() => navigate(`/assets/${assetId}`, { state: { total_brl: data.total_brl } })}
                      className="text-xs hover:bg-amber-200 text-amber-800 pl-2 pr-1 py-1 rounded-l-lg transition-colors dark:hover:bg-amber-900/60 dark:text-amber-200"
                    >
                      {item.params.code as string} · {item.params.ratio as string} →
                    </button>
                    <button
                      onClick={() => dismissNotification(item)}
                      className="text-amber-500 hover:text-amber-800 px-1.5 py-1 transition-colors dark:text-amber-400 dark:hover:text-amber-200"
                      aria-label={t.notifications.dismiss}
                    >
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" /></svg>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

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

      {/* Row 2: AllocationChart + Top movers */}
      {(() => {
        const tdd = t.dashboard as unknown as Record<string, string>
        const movingAssets = (data.by_asset ?? [])
          .filter(a => !a.needs_manual && a.source !== 'manual' && a.value_brl > 0 && dashReturns?.[a.id] != null)
          .map(a => ({ ...a, ret: dashReturns![a.id]! }))
          .sort((a, b) => b.ret - a.ret)
        const gainers = movingAssets.filter(a => a.ret > 0).slice(0, 5)
        const losers  = [...movingAssets].reverse().filter(a => a.ret < 0).slice(0, 5)
        const hasAllocation = data.by_class.length > 0
        const hasMovers = dashReturnsLoading || gainers.length > 0 || losers.length > 0
        if (!hasAllocation && !hasMovers) return null
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {hasAllocation && (
              <div className={hasMovers ? undefined : 'lg:col-span-2'}>
                <AllocationChart data={data.by_class} currency={currency} convert={convert} />
              </div>
            )}
            {hasMovers && (
            <div className={hasAllocation ? undefined : 'lg:col-span-2'}>
            <div className="rounded-2xl p-5" style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)' }}>
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
            </div>
            </div>
            )}
          </div>
        )
      })()}

      {/* Link to assets page */}
      {data.by_asset.length > 0 && (
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

      {/* Dividends */}
      {(divLoading || (divSummary && divSummary.total_brl > 0)) && (
        <div className="rounded-2xl p-5" style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--arvo-fg)' }}>{td.title ?? 'Dividendos'}</h2>
            {syncing && <span className="text-xs animate-pulse" style={{ color: 'var(--arvo-fg-soft)' }}>{td.autoSyncing ?? 'Atualizando...'}</span>}
          </div>
          {divLoading ? (
            <div className="h-14 flex items-center justify-center">
              <div className="text-xs animate-pulse" style={{ color: 'var(--arvo-fg-soft)' }}>{td.syncing ?? 'Carregando...'}</div>
            </div>
          ) : divSummary && divSummary.total_brl > 0 ? (
            <div className="flex flex-wrap gap-4 items-start">
              <div className="shrink-0">
                <p className="text-xs uppercase tracking-wide mb-0.5" style={{ color: 'var(--arvo-fg-soft)' }}>{td.totalReceived ?? 'Total recebido'}</p>
                <p className="text-xl font-bold" style={{ color: 'var(--arvo-green)' }}>{fmt(convert(divSummary.total_brl))}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--arvo-fg-soft)' }}>{periodLabel}</p>
              </div>
              <div className="flex-1 min-w-[160px]">
                <p className="text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--arvo-fg-soft)' }}>{td.topPayers ?? 'Maiores pagadores'}</p>
                <div className="space-y-1">
                  {divSummary.by_asset.slice(0, 3).map(a => (
                    <div key={a.asset_id} className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium truncate" style={{ color: 'var(--arvo-fg-muted)' }}>{a.code}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--arvo-border)' }}>
                          <div className="h-full rounded-full" style={{ background: 'var(--arvo-green)', width: `${Math.min(100, (a.total_brl / divSummary.by_asset[0].total_brl) * 100)}%` }} />
                        </div>
                        <span className="text-xs w-16 text-right" style={{ color: 'var(--arvo-fg-muted)' }}>{fmt(convert(a.total_brl))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {divSummary.by_month.length > 1 && (
                <div className="flex-1 min-w-[140px] h-20">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={divSummary.by_month.map(m => ({ month: m.month.slice(5), value: convert(m.total_brl) }))}>
                      <XAxis dataKey="month" tick={{ fontSize: 9, fill: 'var(--arvo-fg-soft)' }} />
                      <YAxis hide />
                      <Tooltip
                        formatter={(v) => [new Intl.NumberFormat(intlLocale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(typeof v === 'number' ? v : 0), td.title ?? 'Dividendos']}
                        contentStyle={{ borderRadius: 8, border: '1px solid var(--arvo-border)', background: 'var(--arvo-surface)', color: 'var(--arvo-fg)', fontSize: 12 }}
                      />
                      <Bar dataKey="value" fill="#1F8A5B" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--arvo-fg-soft)' }}>{td.noData ?? 'Nenhum dividendo no período'}</p>
          )}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
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

            {/* Link area */}
            {shareLink && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--arvo-fg-soft)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{s.linkLabel}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1, background: 'var(--arvo-surface-2)', border: '1px solid var(--arvo-border)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--arvo-fg-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {window.location.origin}/share/portfolio/{shareLink.token}
                  </div>
                  <button onClick={copyShareLink} style={{ padding: '8px 14px', background: shareCopied ? '#16A34A' : 'var(--arvo-pill-active-bg)', color: shareCopied ? '#fff' : 'var(--arvo-pill-active-fg)', border: 'none', borderRadius: 8, fontSize: 12, cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s' }}>
                    {shareCopied ? s.copied : s.copy}
                  </button>
                </div>
                {shareLink.updated_at && (
                  <p style={{ fontSize: 11, color: 'var(--arvo-fg-soft)', marginTop: 6 }}>
                    {s.updatedAt} {new Date(shareLink.updated_at).toLocaleDateString(locale === 'fr' ? 'fr-FR' : locale === 'en' ? 'en-GB' : 'pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                )}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={handleGenerateShare}
                disabled={shareLoading}
                style={{ flex: 1, padding: '10px 16px', background: 'var(--arvo-pill-active-bg)', color: 'var(--arvo-pill-active-fg)', border: 'none', borderRadius: 8, fontSize: 12, fontFamily: 'var(--arvo-font-body)', cursor: 'pointer', opacity: shareLoading ? 0.7 : 1 }}
              >
                {shareLoading ? s.refreshing : shareLink ? s.refresh : s.generate}
              </button>
              {shareLink && (
                <>
                  <a
                    href={`/share/portfolio/${shareLink.token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ padding: '10px 16px', background: 'var(--arvo-chip-bg)', color: 'var(--arvo-fg)', border: 'none', borderRadius: 8, fontSize: 12, fontFamily: 'var(--arvo-font-body)', cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}
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
                    style={{ padding: '10px 14px', background: 'var(--arvo-chip-bg)', color: 'var(--arvo-fg)', border: 'none', borderRadius: 8, fontSize: 12, fontFamily: 'var(--arvo-font-body)', cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}
                  >
                    <svg style={{ width: 12, height: 12 }} fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 2v8M5 7l3 3 3-3M3 12h10"/>
                    </svg>
                    {s.downloadPdf}
                  </a>
                  <button
                    onClick={handleDeactivateShare}
                    style={{ padding: '10px 14px', background: 'rgba(220,38,38,0.12)', color: '#DC2626', border: 'none', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}
                  >
                    {s.deactivate}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
