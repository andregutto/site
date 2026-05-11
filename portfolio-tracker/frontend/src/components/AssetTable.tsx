import { useState } from 'react'
import type { PortfolioAsset } from '../lib/types'
import { useCurrency } from '../contexts/CurrencyContext'

interface Props {
  assets: PortfolioAsset[]
  onAssetClick?: (asset: PortfolioAsset) => void
}

function fmtNumber(v: number, decimals = 4) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: decimals }).format(v)
}

export default function AssetTable({ assets, onAssetClick }: Props) {
  const { fmt, currency } = useCurrency()
  const [search, setSearch]   = useState('')
  const [sortKey, setSortKey] = useState<'value_brl' | 'code' | 'class_name'>('value_brl')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const filtered = assets
    .filter(a =>
      a.code.toLowerCase().includes(search.toLowerCase()) ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.class_name.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      // Ativos com needs_manual sempre ao final
      if (a.needs_manual && !b.needs_manual) return 1
      if (!a.needs_manual && b.needs_manual) return -1
      const va = a[sortKey] ?? 0
      const vb = b[sortKey] ?? 0
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)
      return sortDir === 'asc' ? cmp : -cmp
    })

  // Total apenas dos ativos com valor real
  const total = assets.filter(a => !a.needs_manual).reduce((s, a) => s + a.value_brl, 0)
  const needsCount = assets.filter(a => a.needs_manual).length

  function SortIcon({ col }: { col: typeof sortKey }) {
    if (sortKey !== col) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-[#001A70] ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-gray-800">Ativos ({assets.length})</h2>
          {needsCount > 0 && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
              {needsCount} aguardando valor
            </span>
          )}
        </div>
        <input
          type="text"
          placeholder="Filtrar..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-full sm:w-48 focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left cursor-pointer hover:text-gray-700" onClick={() => toggleSort('code')}>
                Ativo <SortIcon col="code" />
              </th>
              <th className="px-4 py-3 text-left cursor-pointer hover:text-gray-700" onClick={() => toggleSort('class_name')}>
                Classe <SortIcon col="class_name" />
              </th>
              <th className="px-4 py-3 text-right">Holdings</th>
              <th className="px-4 py-3 text-right">Preço</th>
              <th className="px-4 py-3 text-right cursor-pointer hover:text-gray-700" onClick={() => toggleSort('value_brl')}>
                Valor {currency} <SortIcon col="value_brl" />
              </th>
              <th className="px-4 py-3 text-right">% Cart.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((asset) => (
              <tr
                key={asset.id}
                onClick={() => onAssetClick?.(asset)}
                className={`transition-colors ${
                  onAssetClick ? 'cursor-pointer' : ''
                } ${
                  asset.needs_manual
                    ? 'bg-amber-50/50 hover:bg-amber-50'
                    : 'hover:bg-gray-50'
                }`}
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{asset.code}</div>
                  <div className="text-xs text-gray-400 truncate max-w-[180px]">{asset.name}</div>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: asset.class_color }} />
                    <span className="text-gray-600 text-xs">{asset.class_name}</span>
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-gray-600">
                  {asset.holdings != null ? fmtNumber(asset.holdings, 6) : '—'}
                </td>
                <td className="px-4 py-3 text-right text-gray-600">
                  {asset.needs_manual ? (
                    <span className="text-xs text-amber-600 font-medium">Informar →</span>
                  ) : asset.price != null ? (
                    `${asset.currency} ${fmtNumber(asset.price, 2)}`
                  ) : asset.source === 'manual' ? (
                    '(manual)'
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
                  {asset.needs_manual ? '—' : total > 0 ? ((asset.value_brl / total) * 100).toFixed(1) + '%' : '0.0%'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t border-gray-200">
            <tr>
              <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-gray-700">Total</td>
              <td className="px-4 py-3 text-right font-bold text-gray-900">{fmt(total)}</td>
              <td className="px-4 py-3 text-right text-gray-500">100%</td>
            </tr>
          </tfoot>
        </table>
        {filtered.length === 0 && (
          <p className="text-center text-gray-400 py-8 text-sm">Nenhum ativo encontrado</p>
        )}
      </div>
    </div>
  )
}
