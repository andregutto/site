import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import { useI18n } from '../contexts/I18nContext'
import { PageLoader } from './ArvoLoader'
import { EmptyState } from './ui'

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
  if (!d) return '-'
  const [y, m, dd] = d.split('-')
  return `${dd}/${m}/${y}`
}

export default function ArchivedAssetsList() {
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

  if (loading) return <PageLoader />

  if (assets.length === 0) return <EmptyState title={t.archived.empty} />

  return (
    <div className="space-y-3">
      {assets.map(a => {
        const isOpen = expanded.has(a.id)
        const pnlPositive = a.pnl >= 0
        const classColor = a.asset_classes?.color ?? '#94a3b8'
        const className  = a.asset_classes?.name ?? '-'

        return (
          <div key={a.id} className="bg-[var(--arvo-surface)] rounded-xl border border-[var(--arvo-border)] shadow-sm overflow-hidden">
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--arvo-surface-2)] transition-colors"
              onClick={() => toggleExpand(a.id)}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: classColor }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[var(--arvo-fg)] text-sm">{a.code}</span>
                  <span className="text-xs text-[var(--arvo-fg-soft)] truncate hidden sm:inline">{a.name}</span>
                  <span className="text-xs text-[var(--arvo-fg-faint)] hidden sm:inline">·</span>
                  <span className="text-xs text-[var(--arvo-fg-soft)] hidden sm:inline">{className}</span>
                </div>
                {a.firstDate && (
                  <div className="text-xs text-[var(--arvo-fg-soft)] mt-0.5">
                    {t.archived.period}: {fmtDate(a.firstDate)} → {fmtDate(a.lastDate)}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right hidden sm:block">
                  <div className="text-xs text-[var(--arvo-fg-soft)]">{t.archived.invested}</div>
                  <div className="text-sm font-medium text-[var(--arvo-fg)]">{fmt(a.totalInvested, a.currency)}</div>
                </div>
                {a.totalReceived > 0 && (
                  <div className="text-right hidden sm:block">
                    <div className="text-xs text-[var(--arvo-fg-soft)]">{t.archived.received}</div>
                    <div className="text-sm font-medium text-[var(--arvo-fg)]">{fmt(a.totalReceived, a.currency)}</div>
                  </div>
                )}
                {a.totalReceived > 0 && (
                  <div className="text-right">
                    <div className="text-xs text-[var(--arvo-fg-soft)]">{t.archived.pnl}</div>
                    <div className={`text-sm font-semibold ${pnlPositive ? 'arvo-delta-pos' : 'arvo-delta-neg'}`}>
                      {pnlPositive ? '+' : ''}{fmt(a.pnl, a.currency)}
                    </div>
                  </div>
                )}
                <svg
                  className={`w-4 h-4 text-[var(--arvo-fg-soft)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {isOpen && (
              <div className="border-t border-[var(--arvo-border)] px-4 py-3 space-y-3">
                <div className="text-xs font-medium text-[var(--arvo-fg-muted)] uppercase tracking-wide">
                  {t.archived.contributions}
                </div>
                <div className="space-y-1.5">
                  {a.contributions.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs font-medium px-1.5 py-0.5 rounded"
                          style={{ background: 'var(--arvo-surface-2)', color: 'var(--arvo-fg-muted)' }}
                        >
                          {c.type === 'buy' ? '▲' : '▼'}
                        </span>
                        <span className="text-[var(--arvo-fg-muted)]">{fmtDate(c.date)}</span>
                      </div>
                      <div className="text-right text-[var(--arvo-fg)]">
                        {c.quantity} × {fmt(c.price_orig, c.currency)}
                        <span className="text-[var(--arvo-fg-soft)] ml-2">= {fmt(c.quantity * c.price_orig, c.currency)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    onClick={() => handleDelete(a.id, a.name)}
                    disabled={deleting === a.id || reactivating === a.id}
                    className="text-xs text-red-500 hover:text-red-600 disabled:opacity-50 border border-red-200 hover:border-red-300 rounded-lg px-3 py-1.5 transition-colors dark:text-red-400 dark:hover:text-red-300 dark:border-red-900 dark:hover:border-red-800"
                  >
                    {deleting === a.id ? '...' : t.archived.deletePermanently}
                  </button>
                  <button
                    onClick={() => handleReactivate(a.id)}
                    disabled={reactivating === a.id || deleting === a.id}
                    className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50 border border-blue-200 hover:border-blue-300 rounded-lg px-3 py-1.5 transition-colors dark:text-blue-300 dark:hover:text-blue-300 dark:border-blue-900 dark:hover:border-blue-800"
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
  )
}
