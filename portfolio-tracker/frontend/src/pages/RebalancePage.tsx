import { useState, useEffect } from 'react'
import { usePortfolioValue } from '../hooks/usePortfolio'
import { useCurrency } from '../contexts/CurrencyContext'
import { useI18n } from '../contexts/I18nContext'
import { apiFetch } from '../lib/api'
import { PageLoader } from '../components/ArvoLoader'
import { Icon } from '../components/icons'

export default function RebalancePage() {
  const { data, loading: portfolioLoading } = usePortfolioValue()
  const { fmt } = useCurrency()
  const { t } = useI18n()
  const r = t.rebalance
  const classNames = (t.classes.names as Record<string, string>) ?? {}
  const resolveClassName = (name: string, nameKey?: string | null) => {
    if (nameKey && classNames[nameKey]) return classNames[nameKey]
    if (name === 'Sem classe') return t.classes.noClass
    return name
  }

  const [targets, setTargets]       = useState<Record<string, string>>({})
  const [profileLoading, setProfileLoading] = useState(true)
  const [saving, setSaving]         = useState(false)
  const [saveOk, setSaveOk]         = useState(false)

  const getKey = (cls: { name: string; name_key?: string | null }) => cls.name_key ?? cls.name
  const getTargetStr = (cls: { name: string; name_key?: string | null }) =>
    targets[getKey(cls)] ?? targets[cls.name] ?? ''

  useEffect(() => {
    apiFetch<{ allocation_targets: Record<string, number> }>('/profile')
      .then(d => {
        const t: Record<string, string> = {}
        for (const [k, v] of Object.entries(d.allocation_targets ?? {})) t[k] = String(v)
        setTargets(t)
      })
      .catch(() => {})
      .finally(() => setProfileLoading(false))
  }, [])

  const classes    = data?.by_class ?? []
  const totalBrl   = data?.total_brl ?? 0
  const totalTarget = classes.reduce((s, c) => s + (parseFloat(getTargetStr(c)) || 0), 0)

  async function handleSave() {
    setSaving(true)
    const numericTargets: Record<string, number> = {}
    for (const [k, v] of Object.entries(targets)) {
      const n = parseFloat(v)
      if (!isNaN(n) && n >= 0) numericTargets[k] = n
    }
    try {
      await apiFetch('/profile', {
        method: 'PATCH',
        body: JSON.stringify({ allocation_targets: numericTargets }),
      })
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 3000)
    } catch { /* silently ignore */ } finally {
      setSaving(false)
    }
  }

  if (portfolioLoading || profileLoading) {
    return <PageLoader />
  }

  const targetSumOk = Math.abs(totalTarget - 100) < 0.1

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--arvo-fg)]">{r.title}</h1>
          <p className="text-sm text-[var(--arvo-fg-soft)] mt-0.5">{r.subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          {saveOk && <span className="text-xs text-green-600">{r.saved}</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] rounded-xl text-sm font-semibold hover:bg-[var(--arvo-fg)]/90 disabled:opacity-50 transition-colors"
          >
            {saving ? r.saving : r.saveTargets}
          </button>
        </div>
      </div>

      <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-[var(--arvo-border)] flex items-center justify-between">
          <h2 className="font-semibold text-[var(--arvo-fg)]">{r.allocationByClass}</h2>
          {totalTarget > 0 && (
            <span className={`text-xs font-medium ${targetSumOk ? 'text-green-600' : 'text-amber-600'}`}>
              {r.totalTarget.replace('{pct}', totalTarget.toFixed(1))}{!targetSumOk && ` ${r.mustSum100}`}
            </span>
          )}
        </div>

        <div className="divide-y divide-[var(--arvo-border-soft)]">
          {classes.map(cls => {
            const target = parseFloat(getTargetStr(cls)) || null
            const diff   = target != null ? cls.pct - target : null
            return (
              <div key={cls.name} className="px-5 py-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cls.color }} />
                  <span className="font-medium text-[var(--arvo-fg)] flex-1">{resolveClassName(cls.name, cls.name_key)}</span>
                  <span className="text-sm text-[var(--arvo-fg-muted)]">{fmt(cls.value_brl)}</span>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-[var(--arvo-fg-soft)]">
                        {r.current} <span className="font-semibold text-[var(--arvo-fg)]">{cls.pct.toFixed(1)}%</span>
                      </span>
                      {diff != null && (
                        <span className="arvo-num arvo-delta-neutral">
                          {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                          {' '}{Math.abs(diff) < 1 ? r.onTarget : diff > 0 ? r.above : r.below}
                        </span>
                      )}
                    </div>
                    <div className="h-2 bg-[var(--arvo-track-bg)] rounded-full overflow-hidden relative">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(cls.pct, 100)}%`, backgroundColor: cls.color }}
                      />
                      {target != null && (
                        <div
                          className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-[var(--arvo-fg)] rounded-full"
                          style={{ left: `${Math.min(target, 100)}%` }}
                        />
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={getTargetStr(cls)}
                      onChange={e => setTargets(prev => ({ ...prev, [getKey(cls)]: e.target.value }))}
                      placeholder="—"
                      className="w-16 border border-[var(--arvo-border)] rounded-[3px] px-2 py-1.5 text-sm text-center arvo-num bg-[var(--arvo-surface)] text-[var(--arvo-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--arvo-fg)]/20"
                    />
                    <span className="text-xs text-[var(--arvo-fg-soft)]">%</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Suggested actions */}
      {classes.some(c => {
        const t = parseFloat(getTargetStr(c)) || null
        return t != null && Math.abs(c.pct - t) >= 1
      }) && (
        <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-[var(--arvo-border)]">
            <h2 className="font-semibold text-[var(--arvo-fg)]">{r.suggestedActions}</h2>
          </div>
          <div className="divide-y divide-[var(--arvo-border-soft)]">
            {classes.map(cls => {
              const target = parseFloat(getTargetStr(cls)) || null
              if (target == null) return null
              const diff = cls.pct - target
              if (Math.abs(diff) < 1) return null
              const diffBrl = Math.abs((diff / 100) * totalBrl)
              return (
                <div key={cls.name} className="px-5 py-3 flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cls.color }} />
                  <span className="text-sm text-[var(--arvo-fg)] flex-1">{resolveClassName(cls.name, cls.name_key)}</span>
                  <span className="text-sm font-medium text-[var(--arvo-fg-muted)] flex items-center gap-1.5">
                    <Icon name={diff > 0 ? 'arrow-down-right' : 'arrow-up-right'} size={14} />
                    {diff > 0 ? r.reduce : r.increase}
                    <span className={`arvo-num font-semibold ${diff > 0 ? 'arvo-delta-neg' : 'arvo-delta-pos'}`}>{fmt(diffBrl)}</span>
                  </span>
                  <span className="text-xs text-[var(--arvo-fg-soft)] arvo-num">({Math.abs(diff).toFixed(1)}%)</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
