import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import { useI18n } from '../contexts/I18nContext'
import { PageLoader } from '../components/ArvoLoader'

type Contribution = {
  asset_id: number
  type: 'buy' | 'sell'
  quantity: number
  price_orig: number
  currency: string
  date: string
}

type ArchivedAsset = {
  id: number
  code: string
  name: string
  asset_type: string
  currency: string
  asset_classes: { name: string; color: string } | null
  contributions: Contribution[]
  totalInvested: number
  totalReceived: number
  pnl: number
  firstDate: string | null
  lastDate: string | null
}

function fmt(value: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  const [y, m, dd] = d.split('-')
  return `${dd}/${m}/${y}`
}

export default function ArchivedPage() {
  const { t } = useI18n()
  const [assets, setAssets] = useState<ArchivedAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [reactivating, setReactivating] = useState<number | null>(null)
  const [deleting, setDeleting]         = useState<number | null>(null)

  useEffect(() => {
    apiFetch<ArchivedAsset[]>('/assets/archived')
      .then(setAssets)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function toggleExpand(id: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleReactivate(id: number) {
    setReactivating(id)
    try {
      await apiFetch(`/assets/${id}/unarchive`, { method: 'POST' })
      setAssets(prev => prev.filter(a => a.id !== id))
    } catch {
      // ignore
    } finally {
      setReactivating(null)
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!window.confirm(t.archived.deleteConfirm.replace('{name}', name))) return
    setDeleting(id)
    try {
      await apiFetch(`/assets/${id}`, { method: 'DELETE' })
      setAssets(prev => prev.filter(a => a.id !== id))
    } catch {
      alert(t.archived.errorDelete)
    } finally {
      setDeleting(null)
    }
  }

  if (loading) {
    return (
      <PageLoader />
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{t.archived.title}</h1>
        <p className="text-sm text-gray-400 mt-0.5">{t.archived.subtitle}</p>
      </div>

      {assets.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">{t.archived.empty}</div>
      ) : (
        <div className="space-y-3">
          {assets.map(a => {
            const isOpen = expanded.has(a.id)
            const pnlPositive = a.pnl >= 0
            const classColor = a.asset_classes?.color ?? '#94a3b8'
            const className  = a.asset_classes?.name ?? '—'

            return (
              <div key={a.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Header row */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => toggleExpand(a.id)}
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: classColor }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 text-sm">{a.code}</span>
                      <span className="text-xs text-gray-400 truncate hidden sm:inline">{a.name}</span>
                      <span className="text-xs text-gray-300 hidden sm:inline">·</span>
                      <span className="text-xs text-gray-400 hidden sm:inline">{className}</span>
                    </div>
                    {a.firstDate && (
                      <div className="text-xs text-gray-400 mt-0.5">
                        {t.archived.period}: {fmtDate(a.firstDate)} → {fmtDate(a.lastDate)}
                      </div>
                    )}
                  </div>

                  {/* Summary figures */}
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right hidden sm:block">
                      <div className="text-xs text-gray-400">{t.archived.invested}</div>
                      <div className="text-sm font-medium text-gray-700">{fmt(a.totalInvested, a.currency)}</div>
                    </div>
                    {a.totalReceived > 0 && (
                      <div className="text-right hidden sm:block">
                        <div className="text-xs text-gray-400">{t.archived.received}</div>
                        <div className="text-sm font-medium text-gray-700">{fmt(a.totalReceived, a.currency)}</div>
                      </div>
                    )}
                    {a.totalReceived > 0 && (
                      <div className="text-right">
                        <div className="text-xs text-gray-400">{t.archived.pnl}</div>
                        <div className={`text-sm font-semibold ${pnlPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                          {pnlPositive ? '+' : ''}{fmt(a.pnl, a.currency)}
                        </div>
                      </div>
                    )}
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Expanded: contribution list */}
                {isOpen && (
                  <div className="border-t border-gray-100 px-4 py-3 space-y-3">
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      {t.archived.contributions}
                    </div>
                    <div className="space-y-1.5">
                      {a.contributions.map((c, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                              c.type === 'buy'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-red-50 text-red-600'
                            }`}>
                              {c.type === 'buy' ? '▲' : '▼'}
                            </span>
                            <span className="text-gray-500">{fmtDate(c.date)}</span>
                          </div>
                          <div className="text-right text-gray-700">
                            {c.quantity} × {fmt(c.price_orig, c.currency)}
                            <span className="text-gray-400 ml-2">= {fmt(c.quantity * c.price_orig, c.currency)}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 flex justify-end gap-2">
                      <button
                        onClick={() => handleDelete(a.id, a.name)}
                        disabled={deleting === a.id || reactivating === a.id}
                        className="text-xs text-red-500 hover:text-red-600 disabled:opacity-50 border border-red-200 hover:border-red-300 rounded-lg px-3 py-1.5 transition-colors"
                      >
                        {deleting === a.id ? '...' : t.archived.deletePermanently}
                      </button>
                      <button
                        onClick={() => handleReactivate(a.id)}
                        disabled={reactivating === a.id || deleting === a.id}
                        className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50 border border-blue-200 hover:border-blue-300 rounded-lg px-3 py-1.5 transition-colors"
                      >
                        {reactivating === a.id ? '...' : t.archived.reactivate}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
