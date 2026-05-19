import { useState, useEffect } from 'react'
import { usePortfolioValue } from '../hooks/usePortfolio'
import { useCurrency } from '../contexts/CurrencyContext'
import { apiFetch } from '../lib/api'

export default function RebalancePage() {
  const { data, loading: portfolioLoading } = usePortfolioValue()
  const { fmt } = useCurrency()

  const [targets, setTargets]       = useState<Record<string, string>>({})
  const [profileLoading, setProfileLoading] = useState(true)
  const [saving, setSaving]         = useState(false)
  const [saveOk, setSaveOk]         = useState(false)

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
  const totalTarget = classes.reduce((s, c) => s + (parseFloat(targets[c.name] ?? '') || 0), 0)

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
    return <div className="text-center text-gray-400 text-sm py-12 animate-pulse">Carregando...</div>
  }

  const targetSumOk = Math.abs(totalTarget - 100) < 0.1

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Balanceamento</h1>
          <p className="text-sm text-gray-400 mt-0.5">Metas de alocação por classe</p>
        </div>
        <div className="flex items-center gap-3">
          {saveOk && <span className="text-xs text-green-600">Salvo.</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-[#001A70] text-white rounded-xl text-sm font-semibold hover:bg-[#001A70]/90 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Salvando...' : 'Salvar metas'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Alocação por classe</h2>
          {totalTarget > 0 && (
            <span className={`text-xs font-medium ${targetSumOk ? 'text-green-600' : 'text-amber-600'}`}>
              Meta total: {totalTarget.toFixed(1)}%{!targetSumOk && ' (deve somar 100%)'}
            </span>
          )}
        </div>

        <div className="divide-y divide-gray-50">
          {classes.map(cls => {
            const target = parseFloat(targets[cls.name] ?? '') || null
            const diff   = target != null ? cls.pct - target : null
            return (
              <div key={cls.name} className="px-5 py-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cls.color }} />
                  <span className="font-medium text-gray-800 flex-1">{cls.name}</span>
                  <span className="text-sm text-gray-500">{fmt(cls.value_brl)}</span>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-gray-400">
                        Atual: <span className="font-semibold text-gray-700">{cls.pct.toFixed(1)}%</span>
                      </span>
                      {diff != null && (
                        <span className={
                          Math.abs(diff) < 1 ? 'text-green-600' :
                          diff > 0 ? 'text-red-500' : 'text-blue-500'
                        }>
                          {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                          {' '}{Math.abs(diff) < 1 ? 'na meta' : diff > 0 ? 'acima' : 'abaixo'}
                        </span>
                      )}
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden relative">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(cls.pct, 100)}%`, backgroundColor: cls.color }}
                      />
                      {target != null && (
                        <div
                          className="absolute top-0 h-full w-0.5 bg-gray-600 opacity-50"
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
                      value={targets[cls.name] ?? ''}
                      onChange={e => setTargets(prev => ({ ...prev, [cls.name]: e.target.value }))}
                      placeholder="—"
                      className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
                    />
                    <span className="text-xs text-gray-400">%</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Suggested actions */}
      {classes.some(c => {
        const t = parseFloat(targets[c.name] ?? '') || null
        return t != null && Math.abs(c.pct - t) >= 1
      }) && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Ações sugeridas</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {classes.map(cls => {
              const target = parseFloat(targets[cls.name] ?? '') || null
              if (target == null) return null
              const diff = cls.pct - target
              if (Math.abs(diff) < 1) return null
              const diffBrl = Math.abs((diff / 100) * totalBrl)
              return (
                <div key={cls.name} className="px-5 py-3 flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cls.color }} />
                  <span className="text-sm text-gray-700 flex-1">{cls.name}</span>
                  <span className={`text-sm font-semibold ${diff > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {diff > 0 ? 'Reduzir' : 'Aumentar'} {fmt(diffBrl)}
                  </span>
                  <span className="text-xs text-gray-400">({Math.abs(diff).toFixed(1)}%)</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
