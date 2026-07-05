import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import type { PlaceExpense } from './types'

const RED = '#D63B2F'

function fmtCurrency(n: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency || 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

interface Candidate {
  id: number
  transaction_id: number
  date: string
  amount: number
  currency: string
  description: string
  category: { name: string; icon: string; color: string } | null
}

interface Props {
  tripId: number
  placeId: number
  placeName: string
  onClose: () => void
  onChanged: () => void
}

export default function PlaceExpensesPanel({ tripId, placeId, placeName, onClose, onChanged }: Props) {
  const { t } = useI18n()
  const tv = (t as any).voyage ?? {}
  const ev = tv.expenses ?? {}
  const [expenses, setExpenses] = useState<PlaceExpense[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  const loadExpenses = useCallback(async () => {
    try {
      const data = await apiFetch<{ expenses: PlaceExpense[]; total: number }>(
        `/voyage/trips/${tripId}/places/${placeId}/expenses`
      )
      setExpenses(data.expenses ?? [])
      setTotal(data.total ?? 0)
    } finally {
      setLoading(false)
    }
  }, [tripId, placeId])

  const loadCandidates = useCallback(async (q: string) => {
    setLoadingCandidates(true)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      // Sem busca digitada, manda o nome do lugar pro backend ranquear as
      // transações dos momentos da viagem por semelhança (não precisa ser
      // o nome exato) — assim já chega com sugestões em vez de só "mais recentes".
      else if (placeName) params.set('place_name', placeName)
      const qs = params.toString() ? `?${params.toString()}` : ''
      const data = await apiFetch<{ candidates: Candidate[] }>(
        `/voyage/trips/${tripId}/transactions/candidates${qs}`
      )
      setCandidates(data.candidates ?? [])
    } finally {
      setLoadingCandidates(false)
    }
  }, [tripId, placeName])

  useEffect(() => { loadExpenses() }, [loadExpenses])
  useEffect(() => { loadCandidates('') }, [loadCandidates])

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => loadCandidates(search), 300)
    return () => clearTimeout(t)
  }, [search, loadCandidates])

  function toggle(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function linkSelected() {
    if (selected.size === 0) return
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/voyage/trips/${tripId}/places/${placeId}/expenses`, {
        method: 'POST',
        body: JSON.stringify({ transaction_ids: [...selected] }),
      })
      setSelected(new Set())
      setDirty(true)
      await Promise.all([loadExpenses(), loadCandidates(search)])
    } catch {
      setError(tv.errors?.link ?? 'Erro ao vincular')
    } finally {
      setSaving(false)
    }
  }

  async function unlink(transactionId: number) {
    await apiFetch(`/voyage/trips/${tripId}/places/${placeId}/expenses/${transactionId}`, { method: 'DELETE' })
    setDirty(true)
    await Promise.all([loadExpenses(), loadCandidates(search)])
  }

  function handleClose() {
    if (dirty) onChanged()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div
        className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-[18px] sm:rounded-[18px]"
        style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border-soft)', boxShadow: 'var(--arvo-shadow-lg)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--arvo-border-soft)' }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.30em', textTransform: 'uppercase', color: RED, marginBottom: 2 }}>{ev.label ?? 'DESPESAS'}</p>
            <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 15, letterSpacing: '0.06em', color: 'var(--arvo-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {placeName}
            </p>
          </div>
          <button
            onClick={handleClose}
            style={{ color: 'var(--arvo-fg-soft)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, flexShrink: 0 }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" d="M2 2l12 12M14 2L2 14"/>
            </svg>
          </button>
        </div>

        <div style={{ padding: '20px 24px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Linked expenses */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
              <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)' }}>
                {ev.linked ?? 'Vinculadas'}
              </p>
              {total > 0 && (
                <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg)', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtCurrency(total, expenses[0]?.currency ?? 'EUR')}
                </span>
              )}
            </div>
            {loading ? (
              <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)' }}>{tv.loading ?? 'Carregando…'}</p>
            ) : expenses.length === 0 ? (
              <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 12.5, color: 'var(--arvo-fg-soft)' }}>
                {ev.none ?? 'Nenhuma despesa vinculada ainda'}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {expenses.map(e => (
                  <div key={e.transaction_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0' }}>
                    {e.category && <span style={{ fontSize: 14, flexShrink: 0 }}>{e.category.icon}</span>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.description || '-'}</p>
                      <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)' }}>{fmtDate(e.date)}</p>
                    </div>
                    <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                      {fmtCurrency(Math.abs(e.amount), e.currency)}
                    </span>
                    <button type="button" onClick={() => unlink(e.transaction_id)} title="Desvincular"
                      style={{ padding: 3, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--arvo-fg-soft)', flexShrink: 0 }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" d="M2 2l8 8M10 2L2 10" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Candidate picker */}
          <div style={{ paddingTop: 4, borderTop: '1px solid var(--arvo-border-soft)' }}>
            <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', margin: '12px 0 8px' }}>
              {ev.add ?? 'Adicionar despesa'}
            </p>
            <input
              type="text"
              placeholder={ev.searchTx ?? 'Buscar transação…'}
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', borderRadius: 4, border: '1px solid var(--arvo-border)', fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, background: 'var(--arvo-surface)', color: 'var(--arvo-fg)', outline: 'none', marginBottom: 8, boxSizing: 'border-box' }}
            />
            {loadingCandidates ? (
              <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)' }}>{tv.loading ?? 'Carregando…'}</p>
            ) : candidates.length === 0 ? (
              <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)' }}>
                {search ? (ev.noneFound ?? 'Nenhuma transação encontrada') : (ev.noneAvailable ?? 'Nenhuma transação dos momentos da viagem disponível')}
              </p>
            ) : (
              <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {candidates.map(c => {
                  const checked = selected.has(c.transaction_id)
                  return (
                    <button
                      key={c.transaction_id}
                      type="button"
                      onClick={() => toggle(c.transaction_id)}
                      style={{
                        textAlign: 'left', padding: '7px 8px', borderRadius: 6, cursor: 'pointer',
                        border: `1px solid ${checked ? 'var(--arvo-fg-muted)' : 'transparent'}`,
                        background: checked ? 'var(--arvo-hover-bg)' : 'transparent',
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}
                    >
                      <span style={{ width: 15, height: 15, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${checked ? 'var(--arvo-fg)' : 'var(--arvo-border)'}`, background: checked ? 'var(--arvo-fg)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {checked && <span style={{ fontSize: 10, color: 'var(--arvo-bg)' }}>✓</span>}
                      </span>
                      {c.category && <span style={{ fontSize: 13, flexShrink: 0 }}>{c.category.icon}</span>}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.description || '-'}</p>
                        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)' }}>{fmtDate(c.date)}</p>
                      </div>
                      <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                        {fmtCurrency(Math.abs(c.amount), c.currency)}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            {error && <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: RED, marginTop: 8 }}>{error}</p>}

            {selected.size > 0 && (
              <button
                type="button"
                onClick={linkSelected}
                disabled={saving}
                style={{ width: '100%', marginTop: 10, padding: '9px 0', borderRadius: 8, background: saving ? 'var(--arvo-hover-bg)' : 'var(--arvo-fg)', color: saving ? 'var(--arvo-fg-muted)' : 'var(--arvo-bg)', border: 'none', cursor: saving ? 'default' : 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 13 }}
              >
                {saving
                  ? (ev.linking ?? 'Vinculando…')
                  : (selected.size > 1
                      ? (ev.linkSelectedMany ?? 'Vincular {n} selecionadas').replace('{n}', String(selected.size))
                      : (ev.linkSelectedOne ?? 'Vincular {n} selecionada').replace('{n}', String(selected.size)))}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
