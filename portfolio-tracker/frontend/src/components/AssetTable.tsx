import { useState, useMemo, Fragment } from 'react'
import type { PortfolioAsset } from '../lib/types'
import { useCurrency } from '../contexts/CurrencyContext'
import { useI18n } from '../contexts/I18nContext'
import { useAssetReturns } from '../hooks/usePortfolio'
import { Icon } from './icons'
import { getClassIcon } from '../lib/classIcons'

interface Props {
  assets: PortfolioAsset[]
  onAssetClick?: (asset: PortfolioAsset) => void
  favorites?: Set<number>
  onToggleFavorite?: (id: number) => void
  externalReturns?: import('../lib/types').AssetReturns | null
  externalReturnsLoading?: boolean
}

type SortKey = 'value_brl' | 'code' | 'pct' | 'return'
type PeriodKey = 'current_month' | 'last_30d' | 'last_12' | 'ytd'

function localYM(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return localYM(d)
}

function fmtNumber(v: number, decimals = 4) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: decimals }).format(v)
}

function ClassIcon({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
    >
      <Icon name={getClassIcon(name)} size={13} />
    </span>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 text-[var(--arvo-fg-soft)] transition-transform shrink-0 ${open ? 'rotate-90' : ''}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}

function StarButton({ filled, onClick }: { filled: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      className="p-1 [@media(hover:none)]:opacity-100 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shrink-0"
      title={filled ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
    >
      <svg
        className={`w-3.5 h-3.5 transition-colors ${filled ? 'text-amber-400' : 'text-[var(--arvo-fg-faint)] hover:text-amber-300'}`}
        fill={filled ? 'currentColor' : 'none'}
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={filled ? 0 : 2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
      </svg>
    </button>
  )
}

export default function AssetTable({ assets, onAssetClick, favorites = new Set(), onToggleFavorite, externalReturns, externalReturnsLoading }: Props) {
  const { fmt, currency } = useCurrency()
  const { t } = useI18n()
  const d = t.dashboard

  const hasExternal = externalReturns !== undefined

  const [search,   setSearch]   = useState('')
  const [sortKey,  setSortKey]  = useState<SortKey>('value_brl')
  const [sortDir,  setSortDir]  = useState<'asc' | 'desc'>('desc')
  const [period,   setPeriod]   = useState<PeriodKey>('ytd')
  const [expanded, setExpanded]       = useState<Set<string>>(new Set())
  const [expandedAssets, setExpandedAssets] = useState<Set<number>>(new Set())

  function toggleAssetExpand(id: number) {
    setExpandedAssets(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const PERIOD_OPTIONS: Array<{ key: PeriodKey; label: string }> = [
    { key: 'current_month', label: d.periodCurrent },
    { key: 'last_30d',      label: d.period30d     },
    { key: 'last_12',       label: d.period12m     },
    { key: 'ytd',           label: d.periodYtd     },
  ]

  const now       = new Date()
  const currentYM = localYM(now)

  function getPeriodRange(key: PeriodKey): { from: string; to: string } {
    switch (key) {
      case 'current_month': return { from: currentYM, to: currentYM }
      case 'last_30d':      return { from: addMonths(currentYM, -1), to: currentYM }
      case 'last_12':       return { from: addMonths(currentYM, -11), to: currentYM }
      case 'ytd':           return { from: `${now.getFullYear()}-01`, to: currentYM }
    }
  }

  const { from, to } = getPeriodRange(period)
  const { data: internalReturns, loading: internalLoading } = useAssetReturns(hasExternal ? null : from, hasExternal ? null : to)
  const returns = hasExternal ? externalReturns : internalReturns
  const returnsLoading = hasExternal ? (externalReturnsLoading ?? false) : internalLoading

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(dir => dir === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  function toggleExpand(name: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const q = search.toLowerCase()

  const classNames = (t.classes.names as Record<string, string>) ?? {}
  const resolveClassName = (name: string, nameKey?: string | null) => {
    if (nameKey && classNames[nameKey]) return classNames[nameKey]
    if (name === 'Sem classe') return t.classes.noClass
    return name
  }

  const groups = useMemo(() => {
    const map = new Map<string, { name: string; name_key: string | null; color: string; assets: PortfolioAsset[] }>()

    for (const asset of assets) {
      const key = asset.class_name
      if (!map.has(key)) map.set(key, { name: key, name_key: asset.class_name_key ?? null, color: asset.class_color, assets: [] })
      map.get(key)!.assets.push(asset)
    }

    return Array.from(map.values())
      .map(g => {
        const filtered = g.assets.filter(a =>
          !q ||
          a.code.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q)
        )
        const sorted = [...filtered].sort((a, b) => {
          if (a.needs_manual && !b.needs_manual) return 1
          if (!a.needs_manual && b.needs_manual) return -1
          let cmp = 0
          if (sortKey === 'code') {
            cmp = a.code.localeCompare(b.code)
          } else if (sortKey === 'pct') {
            cmp = a.value_brl - b.value_brl
          } else if (sortKey === 'return') {
            const ra = returns?.[a.id] ?? -Infinity
            const rb = returns?.[b.id] ?? -Infinity
            cmp = ra - rb
          } else {
            cmp = a.value_brl - b.value_brl
          }
          return sortDir === 'asc' ? cmp : -cmp
        })
        const total = g.assets.reduce((s, a) => s + (a.needs_manual ? 0 : a.value_brl), 0)
        return { ...g, assets: sorted, total }
      })
      .filter(g => g.assets.length > 0)
      .sort((a, b) => b.total - a.total)
  }, [assets, q, sortKey, sortDir])

  const portfolioTotal = assets.filter(a => !a.needs_manual).reduce((s, a) => s + a.value_brl, 0)
  const needsCount     = assets.filter(a => a.needs_manual).length

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="ml-1" style={{ color: 'var(--arvo-fg-faint)' }}>↕</span>
    return <span className="ml-1" style={{ color: 'var(--arvo-fg)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)' }}>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4" style={{ borderBottom: '1px solid var(--arvo-border-soft)' }}>
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-sm" style={{ fontFamily: "var(--arvo-font-body)", color: 'var(--arvo-fg)', letterSpacing: '0.06em' }}>{d.assetsTitle} ({assets.length})</h2>
          {needsCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(232,160,32,0.12)', color: 'var(--arvo-ocre)' }}>
              {needsCount} {d.awaitingValue}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {!hasExternal && (
            <div className="flex items-center rounded-full p-0.5 gap-0.5" style={{ background: 'var(--arvo-chip-bg)' }}>
              {PERIOD_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setPeriod(key)}
                  className="px-2.5 py-1 text-xs rounded-full transition-all"
                  style={period === key
                    ? { fontFamily: "var(--arvo-font-body)", background: 'var(--arvo-fg)', color: 'var(--arvo-pill-active-fg)', letterSpacing: '0.06em' }
                    : { fontFamily: "var(--arvo-font-body)", color: 'var(--arvo-fg-soft)', letterSpacing: '0.06em' }}
                >{label}</button>
              ))}
            </div>
          )}
          <input
            type="text"
            placeholder={d.filterPlaceholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="rounded-lg px-3 py-1.5 text-sm w-32 sm:w-40 focus:outline-none bg-transparent"
            style={{ border: '1px solid var(--arvo-border-soft)', color: 'var(--arvo-fg)' }}
          />
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead style={{ background: 'rgba(0,0,0,0.025)' }}>
            <tr>
              <th className="px-4 py-2.5 text-left cursor-pointer w-[36%]" style={{ fontFamily: "var(--arvo-font-body)", fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }} onClick={() => toggleSort('code')}>
                {d.assetsTitle} <SortIcon col="code" />
              </th>
              <th className="px-4 py-2.5 text-right" style={{ fontFamily: "var(--arvo-font-body)", fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }}>{d.colHoldings}</th>
              <th className="px-4 py-2.5 text-right" style={{ fontFamily: "var(--arvo-font-body)", fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }}>{d.colPrice}</th>
              <th className="px-4 py-2.5 text-right" style={{ fontFamily: "var(--arvo-font-body)", fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }}>{d.colInvested}</th>
              <th className="px-4 py-2.5 text-right cursor-pointer" style={{ fontFamily: "var(--arvo-font-body)", fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }} onClick={() => toggleSort('value_brl')}>
                {d.colValue} {currency} <SortIcon col="value_brl" />
              </th>
              <th className="px-4 py-2.5 text-right cursor-pointer" style={{ fontFamily: "var(--arvo-font-body)", fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }} onClick={() => toggleSort('pct')}>
                {d.colPct} <SortIcon col="pct" />
              </th>
              <th className="px-4 py-2.5 text-right cursor-pointer" style={{ fontFamily: "var(--arvo-font-body)", fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--arvo-fg)' }} onClick={() => toggleSort('return')}>
                {d.colReturn} <SortIcon col="return" />
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map(group => {
              const isOpen   = expanded.has(group.name)
              const groupPct = portfolioTotal > 0 ? (group.total / portfolioTotal) * 100 : 0

              const assetsWithRet = group.assets.filter(a =>
                !a.needs_manual && a.value_brl > 0 && (
                  (returns && returns[a.id] != null) ||
                  (a.invested_brl != null && a.invested_brl > 0)
                )
              )
              const totalRetWeight = assetsWithRet.reduce((s, a) => s + a.value_brl, 0)
              const groupRentab = totalRetWeight > 0
                ? assetsWithRet.reduce((s, a) => {
                    const r = (returns && returns[a.id] != null)
                      ? returns[a.id]!
                      : (a.invested_brl != null && a.invested_brl > 0)
                        ? (a.value_brl - a.invested_brl) / a.invested_brl * 100
                        : 0
                    return s + r * a.value_brl
                  }, 0) / totalRetWeight
                : null

              return (
                <Fragment key={group.name}>
                  {/* Group header row - columns aligned with table */}
                  <tr
                    onClick={() => toggleExpand(group.name)}
                    className="cursor-pointer select-none transition-colors"
                    style={{ background: 'var(--arvo-surface-2)', borderTop: '1px solid var(--arvo-border-soft)' }}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <ChevronIcon open={isOpen} />
                        <ClassIcon name={group.name} color={group.color} />
                        <span className="text-sm tracking-tight" style={{ fontFamily: "var(--arvo-font-body)", fontWeight: 600, color: 'var(--arvo-fg)' }}>{resolveClassName(group.name, group.name_key)}</span>
                        <span className="text-xs" style={{ color: 'var(--arvo-fg-muted)' }}>
                          {group.assets.length} {group.assets.length === 1 ? d.asset : d.assets}
                        </span>
                      </div>
                    </td>
                    <td />
                    <td />
                    <td />
                    <td className="px-4 py-3 text-right arvo-num" style={{ fontFamily: "var(--arvo-font-body)", fontWeight: 600, color: 'var(--arvo-fg)' }}>
                      {fmt(group.total)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm arvo-num" style={{ color: 'var(--arvo-fg-soft)' }}>
                      {groupPct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right">
                      {returnsLoading ? (
                        <span className="text-xs" style={{ color: 'var(--arvo-fg-faint)' }}>...</span>
                      ) : groupRentab !== null ? (
                        <span className={`text-xs font-semibold arvo-num ${groupRentab >= 0 ? 'arvo-delta-pos' : 'arvo-delta-neg'}`}>
                          {groupRentab >= 0 ? '+' : ''}{groupRentab.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--arvo-fg-faint)' }}>—</span>
                      )}
                    </td>
                  </tr>

                  {/* Asset rows */}
                  {isOpen && group.assets.map(asset => {
                    const ret = returns?.[asset.id] ?? null
                    return (
                      <tr
                        key={asset.id}
                        onClick={() => onAssetClick?.(asset)}
                        className={`group transition-colors ${onAssetClick ? 'cursor-pointer' : ''} ${asset.needs_manual ? '' : 'hover:bg-[var(--arvo-hover-bg)]'}`}
                        style={{ borderTop: '1px solid var(--arvo-border-soft)', background: asset.needs_manual ? 'rgba(232,160,32,0.04)' : undefined }}
                      >
                        <td className="px-4 py-3 pl-10">
                          <div className="flex items-center gap-1">
                            {onToggleFavorite && (
                              <StarButton
                                filled={favorites.has(asset.id)}
                                onClick={e => { e.stopPropagation(); onToggleFavorite(asset.id) }}
                              />
                            )}
                            <div>
                              <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, fontWeight: 500, color: 'var(--arvo-fg)' }}>{asset.code}</div>
                              <div className="text-xs truncate max-w-[200px]" style={{ color: 'var(--arvo-fg-soft)' }}>{asset.name}</div>
                              {!asset.needs_manual && asset.source === 'manual' && (() => {
                                if (!asset.last_manual_date) return null
                                const days = Math.floor((Date.now() - new Date(asset.last_manual_date).getTime()) / 86_400_000)
                                if (days < 30) return null
                                return (
                                  <span className="text-[10px] text-amber-500 font-medium" title={`Último valor registrado há ${days} dias`}>
                                    ⚠ desatualizado ({days}d)
                                  </span>
                                )
                              })()}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right arvo-num" style={{ color: 'var(--arvo-fg-muted)' }}>
                          {asset.holdings != null ? fmtNumber(asset.holdings, 6) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right arvo-num" style={{ color: 'var(--arvo-fg-muted)' }}>
                          {asset.price != null ? (
                            <div>
                              <div>{asset.currency} {fmtNumber(asset.price, 2)}</div>
                              {asset.invested_brl != null && asset.holdings != null && asset.holdings > 0 && (
                                <div className="text-[11px]" style={{ color: 'var(--arvo-fg-muted)' }}>
                                  PM: {fmt(asset.invested_brl / asset.holdings)}
                                </div>
                              )}
                            </div>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right arvo-num" style={{ color: 'var(--arvo-fg-muted)' }}>
                          {asset.needs_manual && asset.invested_brl == null ? (
                            <span className="text-xs font-medium" style={{ color: 'var(--arvo-ocre)' }}>{d.enterValue}</span>
                          ) : asset.invested_brl != null ? (
                            fmt(asset.invested_brl)
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-medium arvo-num">
                          {asset.needs_manual ? (
                            <span className="text-xs" style={{ color: 'var(--arvo-fg-soft)' }}>—</span>
                          ) : (
                            <span style={{ color: 'var(--arvo-fg)' }}>{fmt(asset.value_brl)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right arvo-num" style={{ color: 'var(--arvo-fg-soft)' }}>
                          {asset.needs_manual || portfolioTotal === 0
                            ? '—'
                            : ((asset.value_brl / portfolioTotal) * 100).toFixed(1) + '%'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {returnsLoading ? (
                            <span className="text-xs" style={{ color: 'var(--arvo-fg-faint)' }}>...</span>
                          ) : ret != null ? (
                            <span className={`text-xs font-semibold arvo-num ${ret >= 0 ? 'arvo-delta-pos' : 'arvo-delta-neg'}`}>
                              {ret >= 0 ? '+' : ''}{ret.toFixed(2)}%
                            </span>
                          ) : asset.invested_brl != null && asset.invested_brl > 0 && asset.value_brl > 0 ? (
                            (() => {
                              const r = (asset.value_brl - asset.invested_brl) / asset.invested_brl * 100
                              return (
                                <span
                                  className={`text-xs font-semibold arvo-num ${r >= 0 ? 'arvo-delta-pos' : 'arvo-delta-neg'}`}
                                  title={t.common.totalReturnTip}
                                >
                                  {r >= 0 ? '+' : ''}{r.toFixed(2)}%
                                </span>
                              )
                            })()
                          ) : (
                            <span className="text-xs" style={{ color: 'var(--arvo-fg-faint)' }}>—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
          <tfoot style={{ background: 'rgba(0,0,0,0.025)', borderTop: '1px solid var(--arvo-border-soft)' }}>
            <tr>
              <td colSpan={4} className="px-4 py-3 text-sm" style={{ fontFamily: "var(--arvo-font-body)", color: 'var(--arvo-fg)', letterSpacing: '0.06em' }}>{t.common.total}</td>
              <td className="px-4 py-3 text-right arvo-num" style={{ fontFamily: "var(--arvo-font-body)", fontWeight: 600, color: 'var(--arvo-fg)' }}>{fmt(portfolioTotal)}</td>
              <td className="px-4 py-3 text-right arvo-num" style={{ color: 'var(--arvo-fg-soft)' }}>100%</td>
              <td className="px-4 py-3" />
            </tr>
          </tfoot>
        </table>
        {groups.length === 0 && (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--arvo-fg-muted)' }}>{d.noAssets}</p>
        )}
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden" style={{ borderTop: '1px solid var(--arvo-border-soft)' }}>
        {groups.length === 0 && (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--arvo-fg-muted)' }}>{d.noAssets}</p>
        )}
        {groups.map(group => {
          const isOpen   = expanded.has(group.name)
          const groupPct = portfolioTotal > 0 ? (group.total / portfolioTotal) * 100 : 0

          const assetsWithRetM = group.assets.filter(a =>
            !a.needs_manual && a.value_brl > 0 && (
              (returns && returns[a.id] != null) ||
              (a.invested_brl != null && a.invested_brl > 0)
            )
          )
          const totalRetWeightM = assetsWithRetM.reduce((s, a) => s + a.value_brl, 0)
          const groupRentabM = totalRetWeightM > 0
            ? assetsWithRetM.reduce((s, a) => {
                const r = (returns && returns[a.id] != null)
                  ? returns[a.id]!
                  : (a.invested_brl != null && a.invested_brl > 0)
                    ? (a.value_brl - a.invested_brl) / a.invested_brl * 100
                    : 0
                return s + r * a.value_brl
              }, 0) / totalRetWeightM
            : null

          return (
            <div key={group.name}>
              {/* Group header */}
              <div
                onClick={() => toggleExpand(group.name)}
                className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none"
                style={{ background: 'var(--arvo-surface-2)', borderTop: '1px solid var(--arvo-border-soft)' }}
              >
                <ChevronIcon open={isOpen} />
                <ClassIcon name={group.name} color={group.color} />
                <span className="flex-1 truncate text-sm" style={{ fontFamily: "var(--arvo-font-body)", fontWeight: 600, color: 'var(--arvo-fg)' }}>{resolveClassName(group.name, group.name_key)}</span>
                {!returnsLoading && groupRentabM !== null && (
                  <span className={`text-xs font-semibold arvo-num ${groupRentabM >= 0 ? 'arvo-delta-pos' : 'arvo-delta-neg'}`}>
                    {groupRentabM >= 0 ? '+' : ''}{groupRentabM.toFixed(2)}%
                  </span>
                )}
                <span className="text-sm arvo-num" style={{ fontFamily: "var(--arvo-font-body)", fontWeight: 600, color: 'var(--arvo-fg)' }}>{fmt(group.total)}</span>
                <span className="text-xs w-10 text-right arvo-num" style={{ color: 'var(--arvo-fg-muted)' }}>{groupPct.toFixed(1)}%</span>
              </div>

              {/* Asset cards */}
              {isOpen && (
                <div>
                  {group.assets.map(asset => {
                    const isCardExpanded = expandedAssets.has(asset.id)
                    const ret = returns?.[asset.id] ?? null
                    const displayRet = ret != null ? ret
                      : (asset.invested_brl != null && asset.invested_brl > 0 && asset.value_brl > 0)
                        ? (asset.value_brl - asset.invested_brl) / asset.invested_brl * 100
                        : null

                    return (
                      <div
                        key={asset.id}
                        className={`group px-4 py-3 ${onAssetClick ? 'cursor-pointer' : ''}`}
                        style={{ background: asset.needs_manual ? 'rgba(232,160,32,0.04)' : 'transparent', borderTop: '1px solid var(--arvo-border-soft)' }}
                        onClick={() => onAssetClick?.(asset)}
                      >
                        <div className="flex items-center gap-2">
                          {onToggleFavorite && (
                            <StarButton
                              filled={favorites.has(asset.id)}
                              onClick={e => { e.stopPropagation(); onToggleFavorite(asset.id) }}
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, fontWeight: 500, color: 'var(--arvo-fg)' }}>{asset.code}</div>
                            <div className="text-xs truncate" style={{ color: 'var(--arvo-fg-soft)' }}>{asset.name}</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              <div className="text-sm font-medium arvo-num" style={{ color: 'var(--arvo-fg)' }}>
                                {asset.needs_manual ? '—' : fmt(asset.value_brl)}
                              </div>
                              {!returnsLoading && displayRet != null && (
                                <div className={`text-xs font-semibold arvo-num ${displayRet >= 0 ? 'arvo-delta-pos' : 'arvo-delta-neg'}`}>
                                  {displayRet >= 0 ? '+' : ''}{displayRet.toFixed(2)}%
                                </div>
                              )}
                            </div>
                            <button
                              onClick={e => { e.stopPropagation(); toggleAssetExpand(asset.id) }}
                              className="p-1 shrink-0"
                              style={{ color: 'var(--arvo-fg-soft)' }}
                              aria-label="Expandir detalhes"
                            >
                              <svg
                                className={`w-4 h-4 transition-transform ${isCardExpanded ? 'rotate-180' : ''}`}
                                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {isCardExpanded && (
                          <div
                            className="mt-2 pt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs"
                            style={{ borderTop: '1px solid var(--arvo-border-soft)' }}
                            onClick={e => e.stopPropagation()}
                          >
                            {asset.holdings != null && (
                              <div className="flex justify-between gap-2">
                                <span style={{ color: 'var(--arvo-fg-soft)' }}>{d.colHoldings}</span>
                                <span className="font-medium arvo-num" style={{ color: 'var(--arvo-fg)' }}>{fmtNumber(asset.holdings, 6)}</span>
                              </div>
                            )}
                            {asset.price != null && (
                              <div className="flex justify-between gap-2">
                                <span style={{ color: 'var(--arvo-fg-soft)' }}>{d.colPrice}</span>
                                <span className="font-medium arvo-num" style={{ color: 'var(--arvo-fg)' }}>{asset.currency} {fmtNumber(asset.price, 2)}</span>
                              </div>
                            )}
                            {asset.invested_brl != null && asset.holdings != null && asset.holdings > 0 && (
                              <div className="flex justify-between gap-2">
                                <span style={{ color: 'var(--arvo-fg-soft)' }}>PM</span>
                                <span className="font-medium arvo-num" style={{ color: 'var(--arvo-fg)' }}>{fmt(asset.invested_brl / asset.holdings)}</span>
                              </div>
                            )}
                            <div className="flex justify-between gap-2">
                              <span style={{ color: 'var(--arvo-fg-soft)' }}>{d.colInvested}</span>
                              <span className="font-medium arvo-num" style={{ color: 'var(--arvo-fg)' }}>
                                {asset.needs_manual && asset.invested_brl == null
                                  ? <span style={{ color: 'var(--arvo-ocre)' }}>{d.enterValue}</span>
                                  : asset.invested_brl != null ? fmt(asset.invested_brl) : '—'}
                              </span>
                            </div>
                            {!asset.needs_manual && portfolioTotal > 0 && (
                              <div className="flex justify-between gap-2">
                                <span style={{ color: 'var(--arvo-fg-soft)' }}>{d.colPct}</span>
                                <span className="font-medium arvo-num" style={{ color: 'var(--arvo-fg)' }}>{((asset.value_brl / portfolioTotal) * 100).toFixed(1)}%</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {groups.length > 0 && (
          <div className="flex justify-between items-center px-4 py-3" style={{ background: 'rgba(0,0,0,0.025)', borderTop: '1px solid var(--arvo-border-soft)' }}>
            <span className="text-sm" style={{ fontFamily: "var(--arvo-font-body)", color: 'var(--arvo-fg)', letterSpacing: '0.06em' }}>{t.common.total}</span>
            <span className="arvo-num" style={{ fontFamily: "var(--arvo-font-body)", fontWeight: 600, color: 'var(--arvo-fg)' }}>{fmt(portfolioTotal)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
