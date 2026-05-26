import { useState, useMemo, Fragment } from 'react'
import type { PortfolioAsset } from '../lib/types'
import { useCurrency } from '../contexts/CurrencyContext'
import { useI18n } from '../contexts/I18nContext'
import { useAssetReturns } from '../hooks/usePortfolio'

interface Props {
  assets: PortfolioAsset[]
  onAssetClick?: (asset: PortfolioAsset) => void
  favorites?: Set<number>
  onToggleFavorite?: (id: number) => void
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

const CLASS_ICON_MAP: [RegExp, string][] = [
  [/ações?\s*brasil|brazil|b3/i,        '📊'],
  [/exterior|eua|usa|intl|internacional|ações?\s*exterior/i, '🌍'],
  [/fii|imobiliário|imobiliario/i,      '🏢'],
  [/cripto|crypto|bitcoin/i,            '💎'],
  [/renda\s*fixa|fixed|tesouro|cdb|lci|lca/i, '🏦'],
  [/previdên|previdencia|pgbl|vgbl/i,   '🛡️'],
  [/imóveis|imoveis|real\s*estate/i,    '🏠'],
  [/commodit/i,                          '🛢️'],
  [/etf/i,                               '📊'],
  [/caixa|cash/i,                        '💰'],
]

function inferIcon(name: string): string | null {
  for (const [re, icon] of CLASS_ICON_MAP) if (re.test(name)) return icon
  return null
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 text-gray-400 transition-transform shrink-0 ${open ? 'rotate-90' : ''}`}
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
        className={`w-3.5 h-3.5 transition-colors ${filled ? 'text-amber-400' : 'text-gray-300 hover:text-amber-300'}`}
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

export default function AssetTable({ assets, onAssetClick, favorites = new Set(), onToggleFavorite }: Props) {
  const { fmt, currency } = useCurrency()
  const { t } = useI18n()
  const d = t.dashboard

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
  const { data: returns, loading: returnsLoading } = useAssetReturns(from, to)

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
    if (sortKey !== col) return <span className="ml-1" style={{ color: 'rgba(13,13,13,0.2)' }}>↕</span>
    return <span className="ml-1" style={{ color: 'var(--arvo-black)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--arvo-offwhite)', border: '1px solid var(--arvo-border-soft)' }}>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4" style={{ borderBottom: '1px solid var(--arvo-border-soft)' }}>
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-sm" style={{ fontFamily: "'Tenor Sans', sans-serif", color: 'var(--arvo-black)', letterSpacing: '0.06em' }}>{d.assetsTitle} ({assets.length})</h2>
          {needsCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(232,160,32,0.12)', color: 'var(--arvo-ocre)' }}>
              {needsCount} {d.awaitingValue}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="flex items-center rounded-full p-0.5 gap-0.5" style={{ background: 'rgba(13,13,13,0.07)' }}>
            {PERIOD_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className="px-2.5 py-1 text-xs rounded-full transition-all"
                style={period === key
                  ? { fontFamily: "'Tenor Sans', sans-serif", background: 'var(--arvo-black)', color: 'var(--arvo-offwhite)', letterSpacing: '0.06em' }
                  : { fontFamily: "'Tenor Sans', sans-serif", color: 'rgba(13,13,13,0.45)', letterSpacing: '0.06em' }}
              >{label}</button>
            ))}
          </div>
          <input
            type="text"
            placeholder={d.filterPlaceholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="rounded-lg px-3 py-1.5 text-sm w-32 sm:w-40 focus:outline-none bg-transparent"
            style={{ border: '1px solid var(--arvo-border-soft)', color: 'var(--arvo-black)' }}
          />
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead style={{ background: 'rgba(232,223,208,0.45)' }}>
            <tr>
              <th className="px-4 py-2.5 text-left cursor-pointer w-[36%]" style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(13,13,13,0.45)' }} onClick={() => toggleSort('code')}>
                {d.assetsTitle} <SortIcon col="code" />
              </th>
              <th className="px-4 py-2.5 text-right" style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(13,13,13,0.45)' }}>{d.colHoldings}</th>
              <th className="px-4 py-2.5 text-right" style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(13,13,13,0.45)' }}>{d.colPrice}</th>
              <th className="px-4 py-2.5 text-right" style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(13,13,13,0.45)' }}>{d.colInvested}</th>
              <th className="px-4 py-2.5 text-right cursor-pointer" style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(13,13,13,0.45)' }} onClick={() => toggleSort('value_brl')}>
                {d.colValue} {currency} <SortIcon col="value_brl" />
              </th>
              <th className="px-4 py-2.5 text-right cursor-pointer" style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(13,13,13,0.45)' }} onClick={() => toggleSort('pct')}>
                {d.colPct} <SortIcon col="pct" />
              </th>
              <th className="px-4 py-2.5 text-right cursor-pointer" style={{ fontFamily: "'Tenor Sans', sans-serif", fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--arvo-black)' }} onClick={() => toggleSort('return')}>
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
                    style={{ background: 'rgba(232,223,208,0.35)', borderTop: '1px solid var(--arvo-border-soft)' }}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <ChevronIcon open={isOpen} />
                        {(() => {
                          const icon = group.assets[0]?.class_icon ?? inferIcon(group.name)
                          return icon
                            ? <span className="text-base leading-none shrink-0">{icon}</span>
                            : <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                        })()}
                        <span className="text-sm tracking-tight" style={{ fontFamily: "'Tenor Sans', sans-serif", fontWeight: 600, color: 'var(--arvo-black)' }}>{resolveClassName(group.name, group.name_key)}</span>
                        <span className="text-xs" style={{ color: 'rgba(13,13,13,0.4)' }}>
                          {group.assets.length} {group.assets.length === 1 ? d.asset : d.assets}
                        </span>
                      </div>
                    </td>
                    <td />
                    <td />
                    <td />
                    <td className="px-4 py-3 text-right tabular-nums" style={{ fontFamily: "'Tenor Sans', sans-serif", fontWeight: 600, color: 'var(--arvo-black)' }}>
                      {fmt(group.total)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm" style={{ color: 'rgba(13,13,13,0.5)' }}>
                      {groupPct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right">
                      {returnsLoading ? (
                        <span className="text-xs" style={{ color: 'rgba(13,13,13,0.25)' }}>...</span>
                      ) : groupRentab !== null ? (
                        <span className="text-xs font-semibold" style={{ color: groupRentab >= 0 ? 'var(--arvo-green)' : 'var(--arvo-red)' }}>
                          {groupRentab >= 0 ? '+' : ''}{groupRentab.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: 'rgba(13,13,13,0.25)' }}>—</span>
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
                        className={`group transition-colors ${onAssetClick ? 'cursor-pointer' : ''}`}
                        style={{ borderTop: '1px solid var(--arvo-border-soft)', background: asset.needs_manual ? 'rgba(232,160,32,0.04)' : 'transparent' }}
                        onMouseEnter={e => { if (!asset.needs_manual) e.currentTarget.style.background = 'rgba(13,13,13,0.02)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = asset.needs_manual ? 'rgba(232,160,32,0.04)' : 'transparent' }}
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
                              <div className="font-medium" style={{ color: 'var(--arvo-black)' }}>{asset.code}</div>
                              <div className="text-xs truncate max-w-[200px]" style={{ color: 'rgba(13,13,13,0.45)' }}>{asset.name}</div>
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
                        <td className="px-4 py-3 text-right" style={{ color: 'rgba(13,13,13,0.6)' }}>
                          {asset.holdings != null ? fmtNumber(asset.holdings, 6) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right" style={{ color: 'rgba(13,13,13,0.6)' }}>
                          {asset.price != null ? (
                            <div>
                              <div>{asset.currency} {fmtNumber(asset.price, 2)}</div>
                              {asset.invested_brl != null && asset.holdings != null && asset.holdings > 0 && (
                                <div className="text-[11px]" style={{ color: 'rgba(13,13,13,0.4)' }}>
                                  PM: {fmt(asset.invested_brl / asset.holdings)}
                                </div>
                              )}
                            </div>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right" style={{ color: 'rgba(13,13,13,0.6)' }}>
                          {asset.needs_manual && asset.invested_brl == null ? (
                            <span className="text-xs font-medium" style={{ color: 'var(--arvo-ocre)' }}>{d.enterValue}</span>
                          ) : asset.invested_brl != null ? (
                            fmt(asset.invested_brl)
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {asset.needs_manual ? (
                            <span className="text-xs" style={{ color: 'rgba(13,13,13,0.35)' }}>—</span>
                          ) : (
                            <span style={{ color: 'var(--arvo-black)' }}>{fmt(asset.value_brl)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right" style={{ color: 'rgba(13,13,13,0.5)' }}>
                          {asset.needs_manual || portfolioTotal === 0
                            ? '—'
                            : ((asset.value_brl / portfolioTotal) * 100).toFixed(1) + '%'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {returnsLoading ? (
                            <span className="text-xs" style={{ color: 'rgba(13,13,13,0.2)' }}>...</span>
                          ) : ret != null ? (
                            <span className="text-xs font-semibold" style={{ color: ret >= 0 ? 'var(--arvo-green)' : 'var(--arvo-red)' }}>
                              {ret >= 0 ? '+' : ''}{ret.toFixed(2)}%
                            </span>
                          ) : asset.invested_brl != null && asset.invested_brl > 0 && asset.value_brl > 0 ? (
                            (() => {
                              const r = (asset.value_brl - asset.invested_brl) / asset.invested_brl * 100
                              return (
                                <span
                                  className="text-xs font-semibold"
                                  style={{ color: r >= 0 ? 'var(--arvo-green)' : 'var(--arvo-red)' }}
                                  title="Rentabilidade total desde o primeiro aporte"
                                >
                                  {r >= 0 ? '+' : ''}{r.toFixed(2)}%
                                </span>
                              )
                            })()
                          ) : (
                            <span className="text-xs" style={{ color: 'rgba(13,13,13,0.2)' }}>—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
          <tfoot style={{ background: 'rgba(232,223,208,0.45)', borderTop: '1px solid var(--arvo-border-soft)' }}>
            <tr>
              <td colSpan={4} className="px-4 py-3 text-sm" style={{ fontFamily: "'Tenor Sans', sans-serif", color: 'var(--arvo-black)', letterSpacing: '0.06em' }}>{t.common.total}</td>
              <td className="px-4 py-3 text-right" style={{ fontFamily: "'Tenor Sans', sans-serif", fontWeight: 600, color: 'var(--arvo-black)' }}>{fmt(portfolioTotal)}</td>
              <td className="px-4 py-3 text-right" style={{ color: 'rgba(13,13,13,0.5)' }}>100%</td>
              <td className="px-4 py-3" />
            </tr>
          </tfoot>
        </table>
        {groups.length === 0 && (
          <p className="text-center py-8 text-sm" style={{ color: 'rgba(13,13,13,0.4)' }}>{d.noAssets}</p>
        )}
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden" style={{ borderTop: '1px solid var(--arvo-border-soft)' }}>
        {groups.length === 0 && (
          <p className="text-center py-8 text-sm" style={{ color: 'rgba(13,13,13,0.4)' }}>{d.noAssets}</p>
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
                style={{ background: 'rgba(232,223,208,0.35)', borderTop: '1px solid var(--arvo-border-soft)' }}
              >
                <ChevronIcon open={isOpen} />
                {(() => {
                  const icon = group.assets[0]?.class_icon ?? inferIcon(group.name)
                  return icon
                    ? <span className="text-base leading-none shrink-0">{icon}</span>
                    : <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                })()}
                <span className="flex-1 truncate text-sm" style={{ fontFamily: "'Tenor Sans', sans-serif", fontWeight: 600, color: 'var(--arvo-black)' }}>{resolveClassName(group.name, group.name_key)}</span>
                {!returnsLoading && groupRentabM !== null && (
                  <span className="text-xs font-semibold" style={{ color: groupRentabM >= 0 ? 'var(--arvo-green)' : 'var(--arvo-red)' }}>
                    {groupRentabM >= 0 ? '+' : ''}{groupRentabM.toFixed(2)}%
                  </span>
                )}
                <span className="text-sm tabular-nums" style={{ fontFamily: "'Tenor Sans', sans-serif", fontWeight: 600, color: 'var(--arvo-black)' }}>{fmt(group.total)}</span>
                <span className="text-xs w-10 text-right" style={{ color: 'rgba(13,13,13,0.4)' }}>{groupPct.toFixed(1)}%</span>
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
                            <div className="font-medium text-sm" style={{ color: 'var(--arvo-black)' }}>{asset.code}</div>
                            <div className="text-xs truncate" style={{ color: 'rgba(13,13,13,0.45)' }}>{asset.name}</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              <div className="text-sm font-medium" style={{ color: 'var(--arvo-black)' }}>
                                {asset.needs_manual ? '—' : fmt(asset.value_brl)}
                              </div>
                              {!returnsLoading && displayRet != null && (
                                <div className="text-xs font-semibold" style={{ color: displayRet >= 0 ? 'var(--arvo-green)' : 'var(--arvo-red)' }}>
                                  {displayRet >= 0 ? '+' : ''}{displayRet.toFixed(2)}%
                                </div>
                              )}
                            </div>
                            <button
                              onClick={e => { e.stopPropagation(); toggleAssetExpand(asset.id) }}
                              className="p-1 shrink-0"
                              style={{ color: 'rgba(13,13,13,0.35)' }}
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
                                <span style={{ color: 'rgba(13,13,13,0.45)' }}>{d.colHoldings}</span>
                                <span className="font-medium tabular-nums" style={{ color: 'var(--arvo-black)' }}>{fmtNumber(asset.holdings, 6)}</span>
                              </div>
                            )}
                            {asset.price != null && (
                              <div className="flex justify-between gap-2">
                                <span style={{ color: 'rgba(13,13,13,0.45)' }}>{d.colPrice}</span>
                                <span className="font-medium tabular-nums" style={{ color: 'var(--arvo-black)' }}>{asset.currency} {fmtNumber(asset.price, 2)}</span>
                              </div>
                            )}
                            {asset.invested_brl != null && asset.holdings != null && asset.holdings > 0 && (
                              <div className="flex justify-between gap-2">
                                <span style={{ color: 'rgba(13,13,13,0.45)' }}>PM</span>
                                <span className="font-medium tabular-nums" style={{ color: 'var(--arvo-black)' }}>{fmt(asset.invested_brl / asset.holdings)}</span>
                              </div>
                            )}
                            <div className="flex justify-between gap-2">
                              <span style={{ color: 'rgba(13,13,13,0.45)' }}>{d.colInvested}</span>
                              <span className="font-medium tabular-nums" style={{ color: 'var(--arvo-black)' }}>
                                {asset.needs_manual && asset.invested_brl == null
                                  ? <span style={{ color: 'var(--arvo-ocre)' }}>{d.enterValue}</span>
                                  : asset.invested_brl != null ? fmt(asset.invested_brl) : '—'}
                              </span>
                            </div>
                            {!asset.needs_manual && portfolioTotal > 0 && (
                              <div className="flex justify-between gap-2">
                                <span style={{ color: 'rgba(13,13,13,0.45)' }}>{d.colPct}</span>
                                <span className="font-medium" style={{ color: 'var(--arvo-black)' }}>{((asset.value_brl / portfolioTotal) * 100).toFixed(1)}%</span>
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
          <div className="flex justify-between items-center px-4 py-3" style={{ background: 'rgba(232,223,208,0.45)', borderTop: '1px solid var(--arvo-border-soft)' }}>
            <span className="text-sm" style={{ fontFamily: "'Tenor Sans', sans-serif", color: 'var(--arvo-black)', letterSpacing: '0.06em' }}>{t.common.total}</span>
            <span style={{ fontFamily: "'Tenor Sans', sans-serif", fontWeight: 600, color: 'var(--arvo-black)' }}>{fmt(portfolioTotal)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
