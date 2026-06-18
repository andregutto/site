import { useState } from 'react'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import type { TripCost, MomentPicker } from './types'
import Avatar from './_shared/Avatar'

function fmtCurrency(n: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

const RED = '#D63B2F'
const RED_SOFT = 'rgba(214,59,47,0.10)'
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
      <div style={{
        height: '100%', borderRadius: 999,
        width: `${pct}%`,
        background: over ? RED : GREEN,
        transition: 'width 400ms ease',
      }} />
    </div>
  )
}

function LinkMomentPanel({ tripId, onLinked }: { tripId: number; onLinked: (cost: TripCost) => void }) {
  const { t } = useI18n()
  const tv = (t as any).voyage ?? {}
  const [mode, setMode] = useState<'none' | 'link' | 'create'>('none')
  const [moments, setMoments] = useState<MomentPicker[]>([])
  const [loadingMoments, setLoadingMoments] = useState(false)
  const [selectedMoment, setSelectedMoment] = useState<number | null>(null)
  const [newName, setNewName] = useState('')
  const [newBudget, setNewBudget] = useState('')
  const [saving, setSaving] = useState(false)

  async function openLink() {
    setMode('link')
    if (moments.length === 0) {
      setLoadingMoments(true)
      const data = await apiFetch<{ moments: MomentPicker[] }>('/api/voyage/moments-for-picker')
      setMoments(data.moments)
      setLoadingMoments(false)
    }
  }

  async function linkMoment() {
    if (!selectedMoment) return
    setSaving(true)
    const data = await apiFetch<{ cost: TripCost }>(`/api/voyage/trips/${tripId}/moments`, {
      method: 'POST', body: JSON.stringify({ moment_id: selectedMoment }),
    })
    onLinked(data.cost)
    setSaving(false)
    setMode('none')
  }

  async function createMoment() {
    setSaving(true)
    const data = await apiFetch<{ cost: TripCost }>(`/api/voyage/trips/${tripId}/create-moment`, {
      method: 'POST', body: JSON.stringify({ name: newName.trim() || undefined, budget: newBudget ? Number(newBudget) : undefined }),
    })
    onLinked(data.cost)
    setSaving(false)
    setMode('none')
    setNewName('')
    setNewBudget('')
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 3,
    border: '1px solid var(--arvo-border)', background: 'var(--arvo-surface)',
    fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg)',
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
            <button key={m.id} type="button"
              onClick={() => setSelectedMoment(m.id)}
              style={{
                textAlign: 'left', padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
                border: selectedMoment === m.id ? `1px solid ${RED}` : '1px solid transparent',
                background: selectedMoment === m.id ? RED_SOFT : 'transparent',
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
          style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, padding: '5px 14px', borderRadius: 5, background: RED, color: '#fff', border: 'none', cursor: !selectedMoment || saving ? 'default' : 'pointer', opacity: !selectedMoment || saving ? 0.6 : 1 }}
        >{saving ? 'Vinculando…' : tv.linkMoment ?? 'Vincular'}</button>
      </div>
    </div>
  )

  if (mode === 'create') return (
    <div style={{ marginTop: 12, padding: 14, borderRadius: 8, background: 'var(--arvo-hover-bg)', border: '1px solid var(--arvo-border-soft)' }}>
      <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 10 }}>
        Novo momento
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
        <input style={fieldStyle} placeholder={tv.momentName ?? 'Nome do momento'} value={newName} onChange={e => setNewName(e.target.value)} />
        <input style={fieldStyle} type="number" min="0" step="0.01" placeholder={tv.momentBudget ?? 'Budget (opcional)'} value={newBudget} onChange={e => setNewBudget(e.target.value)} />
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={() => setMode('none')} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, padding: '5px 12px', borderRadius: 5, background: 'none', border: '1px solid var(--arvo-border)', color: 'var(--arvo-fg-muted)', cursor: 'pointer' }}>Cancelar</button>
        <button type="button" onClick={createMoment} disabled={saving}
          style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, padding: '5px 14px', borderRadius: 5, background: RED, color: '#fff', border: 'none', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}
        >{saving ? 'Criando…' : tv.createMoment ?? 'Criar momento'}</button>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      <button type="button" onClick={openLink}
        style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, letterSpacing: '0.04em', padding: '6px 14px', borderRadius: 6, background: 'transparent', border: `1px solid ${RED}`, color: RED, cursor: 'pointer', transition: 'all 160ms ease' }}
        onMouseEnter={e => { e.currentTarget.style.background = RED_SOFT }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      >{tv.linkMoment ?? 'Vincular momento'}</button>
      <button type="button" onClick={() => setMode('create')}
        style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, letterSpacing: '0.04em', padding: '6px 14px', borderRadius: 6, background: RED, color: '#fff', border: 'none', cursor: 'pointer', transition: 'all 160ms ease' }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
      >{tv.createMoment ?? 'Criar momento'}</button>
    </div>
  )
}

export default function CostCard({ tripId, cost, onCostChanged }: Props) {
  const { t } = useI18n()
  const tv = (t as any).voyage ?? {}
  const fmt = (n: number) => fmtCurrency(n, cost.currency || 'EUR')
  const hasMoments = cost.moments.length > 0
  const overBudget = cost.budget != null && cost.total > cost.budget

  return (
    <div style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 16, boxShadow: 'var(--arvo-shadow-sm)', padding: '20px 22px' }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: hasMoments ? 16 : 0 }}>
        <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)' }}>
          {tv.costCard ?? 'Custo'}
        </p>
        {hasMoments && (
          <a href="/finances/moments" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: RED, textDecoration: 'none', letterSpacing: '0.04em' }}>
            Ver momentos →
          </a>
        )}
      </div>

      {hasMoments ? (
        <>
          {/* Total */}
          <div style={{ marginBottom: 8 }}>
            <span style={{
              fontFamily: 'var(--arvo-font-body)', fontSize: 28, fontVariantNumeric: 'tabular-nums',
              color: overBudget ? RED : 'var(--arvo-fg)', letterSpacing: '-0.02em',
            }}>
              {fmt(cost.total)}
            </span>
            {cost.budget != null && (
              <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)', marginLeft: 6 }}>
                / {fmt(cost.budget)}
              </span>
            )}
          </div>

          <ProgressBar spent={cost.total} budget={cost.budget} />

          {/* Spent / Budget labels */}
          {cost.budget != null && (
            <div className="flex justify-between" style={{ marginTop: 6 }}>
              <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)' }}>{tv.costSpent ?? 'Gasto'}</span>
              <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)' }}>{tv.costBudget ?? 'Budget'}: {fmt(cost.budget)}</span>
            </div>
          )}

          {/* Per-user split (V2 preenchido; V1 mostra se só 1 user) */}
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

          {/* Add more link */}
          <LinkMomentPanel tripId={tripId} onLinked={onCostChanged} />
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
