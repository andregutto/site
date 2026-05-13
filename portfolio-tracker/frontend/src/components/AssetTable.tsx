import { useState, useMemo, Fragment } from 'react'
import type { PortfolioAsset } from '../lib/types'
import { useCurrency } from '../contexts/CurrencyContext'
import { useI18n } from '../contexts/I18nContext'
import { useAssetReturns } from '../hooks/usePortfolio'

interface Props {
  assets: PortfolioAsset[]
  onAssetClick?: (asset: PortfolioAsset) => void
}

type SortKey = 'value_brl' | 'code'
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

export default function AssetTable({ assets, onAssetClick }: Props) {
  const { fmt, currency } = useCurrency()
  const { t } = useI18n()
  const d = t.dashboard

  const [search,   setSearch]   = useState('')
  const [sortKey,  setSortKey]  = useState<SortKey>('value_brl')
  const [sortDir,  setSortDir]  = useState<'asc' | 'desc'>('desc')
  const [period,   setPeriod]   = useState<PeriodKey>('ytd')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

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

  const groups = useMemo(() => {
    const map = new Map<string, { name: string; color: string; assets: PortfolioAsset[] }>()

    for (const asset of assets) {
      const key = asset.class_name
      if (!map.has(key)) map.set(key, { name: key, color: asset.class_color, assets: [] })
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
          const va = sortKey === 'code' ? a.code : a.value_brl
          const vb = sortKey === 'code' ? b.code : b.value_brl
          const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)
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
    if (sortKey !== col) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-[#001A70] ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-gray-100">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-semibold text-gray-800">{d.assetsTitle} ({assets.length})</h2>
          {needsCount > 0 && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
              {needsCount} {d.awaitingValue}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg p-0.5">
            {PERIOD_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  period === key
                    ? 'bg-white text-[#001A70] shadow-sm border border-gray-200'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >{label}</button>
            ))}
          </div>
          <input
            type="text"
            placeholder={d.filterPlaceholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-32 sm:w-40 focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left cursor-pointer hover:text-gray-700 w-[40%]" onClick={() => toggleSort('code')}>
                {d.assetsTitle} <SortIcon col="code" />
              </th>
              <th className="px-4 py-3 text-right">{d.colHoldings}</th>
              <th className="px-4 py-3 text-right">{d.colPrice}</th>
              <th className="px-4 py-3 text-right cursor-pointer hover:text-gray-700" onClick={() => toggleSort('value_brl')}>
                {d.colValue} {currency} <SortIcon col="value_brl" />
              </th>
              <th className="px-4 py-3 text-right">{d.colPct}</th>
              <th className="px-4 py-3 text-right text-[#001A70]">{d.colReturn}</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(group => {
              const isOpen   = expanded.has(group.name)
              const groupPct = portfolioTotal > 0 ? (group.total / portfolioTotal) * 100 : 0

              const assetsWithRet = returns
                ? group.assets.filter(a => !a.needs_manual && a.value_brl > 0 && returns[a.id] != null)
                : []
              const totalRetWeight = assetsWithRet.reduce((s, a) => s + a.value_brl, 0)
              const groupRentab = totalRetWeight > 0
                ? assetsWithRet.reduce((s, a) => s + (returns![a.id]! * a.value_brl), 0) / totalRetWeight
                : null

              return (
                <Fragment key={group.name}>
                  {/* Group header row - columns aligned with table */}
                  <tr
                    onClick={() => toggleExpand(group.name)}
                    className="bg-gray-50/80 border-t border-gray-100 cursor-pointer hover:bg-gray-100/60 transition-colors select-none"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <ChevronIcon open={isOpen} />
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: group.color }}
                        />
                        <span className="font-bold text-gray-900 text-base tracking-tight">{group.name}</span>
                        <span className="text-xs text-gray-400 font-normal">
                          {group.assets.length} {group.assets.length === 1 ? d.asset : d.assets}
                        </span>
                      </div>
                    </td>
                    <td />
                    <td />
                    <td className="px-4 py-3 text-right font-bold text-gray-900 text-base tabular-nums">
                      {fmt(group.total)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-500 font-medium">
                      {groupPct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right">
                      {returnsLoading ? (
                        <span className="text-gray-200 text-xs">...</span>
                      ) : groupRentab !== null ? (
                        <span className={`text-xs font-semibold ${groupRentab >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {groupRentab >= 0 ? '+' : ''}{groupRentab.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
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
                        className={`border-t border-gray-50 transition-colors ${
                          onAssetClick ? 'cursor-pointer' : ''
                        } ${
                          asset.needs_manual
                            ? 'bg-amber-50/50 hover:bg-amber-50'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <td className="px-4 py-3 pl-10">
                          <div className="font-medium text-gray-900">{asset.code}</div>
                          <div className="text-xs text-gray-400 truncate max-w-[200px]">{asset.name}</div>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {asset.holdings != null ? fmtNumber(asset.holdings, 6) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {asset.needs_manual ? (
                            asset.invested_brl != null ? (
                              <span className="text-xs text-gray-500">{fmt(asset.invested_brl)}</span>
                            ) : (
                              <span className="text-xs text-amber-600 font-medium">{d.enterValue}</span>
                            )
                          ) : asset.price != null ? (
                            `${asset.currency} ${fmtNumber(asset.price, 2)}`
                          ) : asset.invested_brl != null ? (
                            <span className="text-xs text-gray-500">{fmt(asset.invested_brl)}</span>
                          ) : asset.source === 'manual' ? (
                            d.manual
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {asset.needs_manual ? (
                            <span className="text-amber-500 text-xs">—</span>
                          ) : (
                            <span className="text-gray-900">{fmt(asset.value_brl)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">
                          {asset.needs_manual || portfolioTotal === 0
                            ? '—'
                            : ((asset.value_brl / portfolioTotal) * 100).toFixed(1) + '%'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {returnsLoading ? (
                            <span className="text-gray-200 text-xs">...</span>
                          ) : ret != null ? (
                            <span className={`text-xs font-semibold ${ret >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {ret >= 0 ? '+' : ''}{ret.toFixed(2)}%
                            </span>
                          ) : asset.invested_brl != null && asset.invested_brl > 0 && asset.value_brl > 0 ? (
                            (() => {
                              const r = (asset.value_brl - asset.invested_brl) / asset.invested_brl * 100
                              return (
                                <span
                                  className={`text-xs font-semibold ${r >= 0 ? 'text-green-600' : 'text-red-600'}`}
                                  title="Rentabilidade total desde o primeiro aporte"
                                >
                                  {r >= 0 ? '+' : ''}{r.toFixed(2)}%
                                </span>
                              )
                            })()
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
          <tfoot className="bg-gray-50 border-t border-gray-200">
            <tr>
              <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-gray-700">{t.common.total}</td>
              <td className="px-4 py-3 text-right font-bold text-gray-900">{fmt(portfolioTotal)}</td>
              <td className="px-4 py-3 text-right text-gray-500">100%</td>
              <td className="px-4 py-3" />
            </tr>
          </tfoot>
        </table>
        {groups.length === 0 && (
          <p className="text-center text-gray-400 py-8 text-sm">{d.noAssets}</p>
        )}
      </div>
    </div>
  )
}
