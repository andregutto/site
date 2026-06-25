import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import type { TripCost, MomentPicker } from './types'
import Avatar from './_shared/Avatar'

function fmtCurrency(n: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

const RED = '#D63B2F'
const GREEN = '#1F8A5B'
const GOLD = '#C8B89A'

interface Props {
  tripId: number
  cost: TripCost
  onCostChanged: (cost: TripCost) => void
}

function ProgressBar({ spent, budget }: { spent: number; budget: number | null }) {
  if (!budget || budget <= 0) return null
  const pct = Math.min((spent / budget) * 100, 100)
  const over = spent > budget
  return (
    <div style={{ height: 4, borderRadius: 999, background: 'var(--arvo-border)', marginTop: 6, overflow: 'hidden' }}>
      <div style={{ height: '100%', borderRadius: 999, width: `${pct}%`, background: over ? RED : GREEN, transition: 'width 400ms ease' }} />
    </div>
  )
}

function LinkMomentPanel({ tripId, onLinked, compact }: { tripId: number; onLinked: (cost: TripCost) => void; compact?: boolean }) {
  const { t } = useI18n()
  const tv = (t as any).voyage ?? {}
  const [mode, setMode] = useState<'none' | 'link'>('none')
  const [moments, setMoments] = useState<MomentPicker[]>([])
  const [loadingMoments, setLoadingMoments] = useState(false)
  const [selectedMoment, setSelectedMoment] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  async function openLink() {
    setMode('link')
    if (moments.length === 0) {
      setLoadingMoments(true)
      const data = await apiFetch<{ moments: MomentPicker[] }>('/voyage/moments-for-picker')
      setMoments(data.moments)
      setLoadingMoments(false)
    }
  }

  async function linkMoment() {
    if (!selectedMoment) return
    setSaving(true)
    const data = await apiFetch<{ cost: TripCost }>(`/voyage/trips/${tripId}/moments`, {
      method: 'POST', body: JSON.stringify({ moment_id: selectedMoment }),
    })
    onLinked(data.cost)
    setSaving(false)
    setMode('none')
  }

  if (mode === 'link') return (
    <div style={{ marginTop: 12, padding: 14, borderRadius: 8, background: 'var(--arvo-hover-bg)', border: '1px solid var(--arvo-border-soft)' }}>
      <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 8 }}>
        Selecionar momento
      </p>
      {loadingMoments ? (
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)' }}>Carregando…</p>
      ) : moments.length === 0 ? (
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)' }}>Nenhum momento encontrado</p>
      ) : (
        <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          {moments.map(m => (
            <button key={m.id} type="button" onClick={() => setSelectedMoment(m.id)}
              style={{
                textAlign: 'left', padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
                border: selectedMoment === m.id ? '1px solid var(--arvo-fg-muted)' : '1px solid transparent',
                background: selectedMoment === m.id ? 'var(--arvo-hover-bg)' : 'transparent',
                fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <span style={{ fontSize: 16 }}>{m.icon}</span>
              <span>{m.name}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={() => setMode('none')} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, padding: '5px 12px', borderRadius: 5, background: 'none', border: '1px solid var(--arvo-border)', color: 'var(--arvo-fg-muted)', cursor: 'pointer' }}>Cancelar</button>
        <button type="button" onClick={linkMoment} disabled={!selectedMoment || saving}
          style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, padding: '5px 14px', borderRadius: 5, background: 'var(--arvo-fg)', color: 'var(--arvo-bg)', border: 'none', cursor: !selectedMoment || saving ? 'default' : 'pointer', opacity: !selectedMoment || saving ? 0.5 : 1 }}
        >{saving ? 'Vinculando…' : tv.linkMoment ?? 'Vincular'}</button>
      </div>
    </div>
  )

  if (compact) return (
    <div style={{ display: 'flex', gap: 10, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--arvo-border-soft)' }}>
      <button type="button" onClick={openLink}
        style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >{tv.linkAnotherMoment ?? '+ Vincular outro momento'}</button>
    </div>
  )

  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      <button type="button" onClick={openLink}
        style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, letterSpacing: '0.04em', padding: '6px 14px', borderRadius: 6, background: 'transparent', border: '1px solid var(--arvo-border)', color: 'var(--arvo-fg)', cursor: 'pointer', transition: 'all 160ms ease' }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--arvo-fg-muted)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--arvo-border)' }}
      >{tv.linkMoment ?? 'Vincular momento'}</button>
    </div>
  )
}

export default function CostCard({ tripId, cost, onCostChanged }: Props) {
  const { t } = useI18n()
  const tv = (t as any).voyage ?? {}
  const fmt = (n: number) => fmtCurrency(n, cost.currency || 'EUR')
  const hasMoments = cost.moments.length > 0
  const overBudget = cost.budget != null && cost.total > cost.budget
  const [expanded, setExpanded] = useState(false)
  const hasCategories = (cost.by_category ?? []).length > 0
  const hasPlaces = (cost.by_place ?? []).length > 0
  const canExpand = hasCategories || hasPlaces

  return (
    <div style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 16, boxShadow: 'var(--arvo-shadow-sm)', padding: '20px 22px' }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: hasMoments ? 16 : 0 }}>
        <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)' }}>
          {tv.costCard ?? 'Custo'}
        </p>
        {hasMoments && (
          <Link to="/finances/moments" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)', textDecoration: 'none', letterSpacing: '0.04em' }}>
            {tv.actions?.viewMoments ?? 'Ver momentos →'}
          </Link>
        )}
      </div>

      {hasMoments ? (
        <>
          {/* Total + expand toggle */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 28, fontVariantNumeric: 'tabular-nums', color: overBudget ? RED : 'var(--arvo-fg)', letterSpacing: '-0.02em' }}>
                {fmt(cost.total)}
              </span>
              {cost.budget != null && (
                <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)', marginLeft: 6 }}>
                  / {fmt(cost.budget)}
                </span>
              )}
            </div>
            {canExpand && (
              <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)', padding: 0 }}
              >
                {expanded ? (tv.actions?.collapse ?? 'Recolher') : (tv.actions?.detail ?? 'Detalhar')}
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 160ms' }}>
                  <path strokeLinecap="round" d="M2 3.5l3 3 3-3"/>
                </svg>
              </button>
            )}
          </div>

          <ProgressBar spent={cost.total} budget={cost.budget} />

          {cost.budget != null && (
            <div className="flex justify-between" style={{ marginTop: 6 }}>
              <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)' }}>{tv.costSpent ?? 'Gasto'}</span>
              <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)' }}>{tv.costBudget ?? 'Budget'}: {fmt(cost.budget)}</span>
            </div>
          )}

          {/* Category breakdown — expandable */}
          {expanded && hasCategories && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--arvo-border-soft)', display: 'flex', flexDirection: 'column', gap: 7 }}>
              <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)', marginBottom: 4 }}>
                {tv.expenses?.byCategory ?? 'Por categoria'}
              </p>
              {cost.by_category.map(c => {
                const pct = cost.total > 0 ? (c.total / cost.total) * 100 : 0
                return (
                  <div key={c.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>{c.icon}</span>
                      <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg)', flex: 1 }}>{c.name}</span>
                      <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', fontVariantNumeric: 'tabular-nums' }}>{fmt(c.total)}</span>
                    </div>
                    <div style={{ height: 3, borderRadius: 999, background: 'var(--arvo-border)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: c.color, borderRadius: 999, transition: 'width 300ms ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Place breakdown — expandable */}
          {expanded && hasPlaces && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--arvo-border-soft)', display: 'flex', flexDirection: 'column', gap: 7 }}>
              <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)', marginBottom: 4 }}>
                {tv.expenses?.byPlace ?? 'Por lugar'}
              </p>
              {cost.by_place.map(p => {
                const pct = cost.total > 0 ? (p.total / cost.total) * 100 : 0
                return (
                  <div key={p.trip_place_id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', fontVariantNumeric: 'tabular-nums' }}>{fmt(p.total)}</span>
                    </div>
                    <div style={{ height: 3, borderRadius: 999, background: 'var(--arvo-border)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: 'var(--arvo-fg-soft)', borderRadius: 999, transition: 'width 300ms ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Per-user split */}
          {cost.by_user.length > 1 && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--arvo-border-soft)' }}>
              <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)', marginBottom: 8 }}>
                {tv.splitByPerson ?? 'Por pessoa'}
              </p>
              {cost.by_user.map((u, i) => {
                const pct = cost.total > 0 ? Math.round((u.total / cost.total) * 100) : 0
                const barColors = ['#1B4FD8', '#D63B2F', '#E8A020', '#1F8A5B', '#C8B89A']
                return (
                  <div key={u.user_id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Avatar name={u.display?.name} email={u.display?.email} size={24} />
                    <div style={{ flex: 1, height: 4, borderRadius: 999, background: 'var(--arvo-border)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: barColors[i % barColors.length], borderRadius: 999 }} />
                    </div>
                    <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg)', fontVariantNumeric: 'tabular-nums', minWidth: 64, textAlign: 'right' }}>
                      {fmt(u.total)}
                    </span>
                    <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)', minWidth: 32, textAlign: 'right' }}>{pct}%</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Linked moments list */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--arvo-border-soft)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cost.moments.map(m => (
              <div key={m.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 15 }}>{m.icon}</span>
                  <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg)' }}>{m.name}</span>
                </div>
                <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg-soft)', fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(m.spent)}
                </span>
              </div>
            ))}
          </div>

          <LinkMomentPanel tripId={tripId} onLinked={onCostChanged} compact />
        </>
      ) : (
        <>
          <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 13, color: GOLD, marginTop: 4, marginBottom: 0 }}>
            {tv.costNone ?? 'Nenhum momento vinculado'}
          </p>
          <LinkMomentPanel tripId={tripId} onLinked={onCostChanged} />
        </>
      )}
    </div>
  )
}
