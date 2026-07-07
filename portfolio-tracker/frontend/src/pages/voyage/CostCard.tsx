import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import type { TripCost, MomentPicker, MomentTransaction } from './types'
import Avatar from './_shared/Avatar'

function fmtCurrency(n: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

const RED = '#D63B2F'
const GREEN = '#1F8A5B'
const GOLD = '#C8B89A'
// Paleta Arvo (terracota, gold, azul, ocre, verde, terracota-escuro…) — usada
// na composição de custo no lugar das cores neon das categorias financeiras,
// pra manter a identidade da marca.
const ARVO_PALETTE = ['#A36A52', '#C8B89A', '#1B4FD8', '#E8A020', '#1F8A5B', '#8C6A28', '#D63B2F']
const USER_COLORS = ['#1B4FD8', '#A36A52', '#E8A020', '#1F8A5B', '#C8B89A']

// Default finance categories carry a name_key so they translate regardless of which
// locale the category was originally created under (mirrors the pattern used across
// the Finance pages' own resolveKey/nameKeys helpers).
function resolveCategoryName(name: string, nameKey: string | null | undefined, keys: Record<string, string>): string {
  if (!nameKey) return name
  return keys[nameKey] ?? name
}

interface Props {
  tripId: number
  cost: TripCost
  onCostChanged: (cost: TripCost) => void
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
    <div style={{ marginTop: 12, padding: 14, borderRadius: 10, background: 'var(--arvo-hover-bg)', border: '1px solid var(--arvo-border-soft)' }}>
      <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--arvo-fg-muted)', marginBottom: 8 }}>
        {tv.selectMoment ?? 'Selecionar momento'}
      </p>
      {loadingMoments ? (
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)' }}>Carregando…</p>
      ) : moments.length === 0 ? (
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)' }}>Nenhum momento encontrado</p>
      ) : (
        <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          {moments.map(m => (
            <button key={m.id} type="button" onClick={() => setSelectedMoment(m.id)}
              style={{
                textAlign: 'left', padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
                border: selectedMoment === m.id ? '1px solid var(--arvo-fg-muted)' : '1px solid transparent',
                background: selectedMoment === m.id ? 'var(--arvo-hover-bg)' : 'transparent',
                fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg)',
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
        <button type="button" onClick={() => setMode('none')} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, padding: '5px 12px', borderRadius: 5, background: 'none', border: '1px solid var(--arvo-border)', color: 'var(--arvo-fg-muted)', cursor: 'pointer' }}>Cancelar</button>
        <button type="button" onClick={linkMoment} disabled={!selectedMoment || saving}
          style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, padding: '5px 14px', borderRadius: 5, background: 'var(--arvo-fg)', color: 'var(--arvo-bg)', border: 'none', cursor: !selectedMoment || saving ? 'default' : 'pointer', opacity: !selectedMoment || saving ? 0.5 : 1 }}
        >{saving ? 'Vinculando…' : tv.linkMoment ?? 'Vincular'}</button>
      </div>
    </div>
  )

  return (
    <button type="button" onClick={openLink}
      style={{ fontFamily: 'var(--arvo-font-body)', fontSize: compact ? 11 : 11.5, letterSpacing: '0.04em', padding: compact ? 0 : '6px 14px', borderRadius: 6, background: 'transparent', border: compact ? 'none' : '1px solid var(--arvo-border)', color: compact ? 'var(--arvo-fg-soft)' : 'var(--arvo-fg)', cursor: 'pointer', transition: 'all 160ms ease' }}
    >{compact ? (tv.linkAnotherMoment ?? '+ Vincular outro momento') : (tv.linkMoment ?? 'Vincular momento')}</button>
  )
}

/** Rótulo de seção discreto reutilizável. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)', margin: 0 }}>
      {children}
    </p>
  )
}

export default function CostCard({ tripId, cost, onCostChanged }: Props) {
  const { t } = useI18n()
  const tv = (t as any).voyage ?? {}
  const categoryNameKeys: Record<string, string> = {
    categoryTransfer:      t.finances.categoryTransfer,
    categorySalary:        t.finances.categorySalary,
    categoryUncategorized: t.finances.categoryUncategorized,
    categoryGroceries:     t.finances.categoryGroceries,
    categoryRestaurant:    t.finances.categoryRestaurant,
    categoryTransport:     t.finances.categoryTransport,
    categoryHealth:        t.finances.categoryHealth,
    categoryEntertainment: t.finances.categoryEntertainment,
    categoryHousing:       t.finances.categoryHousing,
    categoryStreaming:     t.finances.categoryStreaming,
    categorySubscriptions: t.finances.categorySubscriptions,
  }
  const fmt = (n: number) => fmtCurrency(n, cost.currency || 'EUR')
  const hasMoments = cost.moments.length > 0
  const overBudget = cost.budget != null && cost.total > cost.budget
  const [showByPlace, setShowByPlace] = useState(false)

  const categories = cost.by_category ?? []
  const places = cost.by_place ?? []
  const users = cost.by_user ?? []
  const hasCategories = categories.length > 0
  const hasPlaces = places.length > 0
  const hasSplit = users.length > 1

  const [showTransactions, setShowTransactions] = useState(false)
  const [transactions, setTransactions] = useState<MomentTransaction[] | null>(null)
  const [groupNames, setGroupNames] = useState<Record<string, string>>({})
  const [loadingTx, setLoadingTx] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  async function toggleTransactions() {
    const next = !showTransactions
    setShowTransactions(next)
    if (next && transactions === null) {
      setLoadingTx(true)
      const data = await apiFetch<{ transactions: MomentTransaction[]; reimbursement_groups: Record<string, string> }>(`/voyage/trips/${tripId}/transactions`)
      setTransactions(data.transactions)
      setGroupNames(data.reimbursement_groups)
      setLoadingTx(false)
    }
  }

  type TxDisplayItem =
    | { kind: 'tx'; tx: MomentTransaction }
    | { kind: 'group'; groupId: string; name: string; txs: MomentTransaction[]; net: number }
  const txDisplayItems: TxDisplayItem[] = []
  if (transactions) {
    const seenGroups = new Set<string>()
    for (const tx of transactions) {
      if (tx.reimbursement_group_id) {
        if (seenGroups.has(tx.reimbursement_group_id)) continue
        seenGroups.add(tx.reimbursement_group_id)
        const groupTxs = transactions.filter(t => t.reimbursement_group_id === tx.reimbursement_group_id)
        const net = groupTxs.reduce((s, t) => s + t.amount, 0)
        txDisplayItems.push({ kind: 'group', groupId: tx.reimbursement_group_id, name: groupNames[tx.reimbursement_group_id] ?? (tv.reimbursementGroup ?? 'Grupo de reembolso'), txs: groupTxs, net })
      } else {
        txDisplayItems.push({ kind: 'tx', tx })
      }
    }
  }

  // Estado vazio: nenhum momento vinculado ainda.
  if (!hasMoments) {
    return (
      <div style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 16, boxShadow: 'var(--arvo-shadow-sm)', padding: '20px 22px' }}>
        <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 14, color: GOLD, marginTop: 0, marginBottom: 12 }}>
          {tv.costNone ?? 'Nenhum momento vinculado'}
        </p>
        <LinkMomentPanel tripId={tripId} onLinked={onCostChanged} />
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 16, boxShadow: 'var(--arvo-shadow-sm)', padding: '18px 22px 16px' }}>
      {/* Linha de contexto de budget — sem repetir o total grande (já está na faixa acima). */}
      {cost.budget != null && (
        <div style={{ marginBottom: hasCategories ? 18 : 0 }}>
          <div className="flex items-baseline justify-between" style={{ marginBottom: 6 }}>
            <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)' }}>
              {fmt(cost.total)} {tv.costOf ?? 'de'} {fmt(cost.budget)}
            </span>
            <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: overBudget ? RED : GREEN }}>
              {overBudget
                ? `+${fmt(cost.total - cost.budget)} ${tv.costOver ?? 'acima'}`
                : `${fmt(cost.budget - cost.total)} ${tv.costLeft ?? 'restantes'}`}
            </span>
          </div>
          <div style={{ height: 5, borderRadius: 999, background: 'var(--arvo-border)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 999, width: `${Math.min((cost.total / cost.budget) * 100, 100)}%`, background: overBudget ? RED : GREEN, transition: 'width 400ms ease' }} />
          </div>
        </div>
      )}

      {/* POR CATEGORIA — destaque principal, já aberto. */}
      {hasCategories && (
        <div>
          <SectionLabel>{tv.expenses?.byCategory ?? 'Por categoria'}</SectionLabel>

          {/* Barra de composição: uma só barra segmentada por cor de categoria. */}
          <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', margin: '10px 0 14px', background: 'var(--arvo-border)' }}>
            {categories.map((c, i) => {
              const pct = cost.total > 0 ? (c.total / cost.total) * 100 : 0
              if (pct <= 0) return null
              const label = resolveCategoryName(c.name, c.name_key, categoryNameKeys)
              return <div key={c.id} title={`${label} · ${fmt(c.total)}`} style={{ width: `${pct}%`, background: ARVO_PALETTE[i % ARVO_PALETTE.length], transition: 'width 400ms ease' }} />
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {categories.map((c, i) => {
              const pct = cost.total > 0 ? Math.round((c.total / cost.total) * 100) : 0
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: ARVO_PALETTE[i % ARVO_PALETTE.length], flexShrink: 0 }} />
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{c.icon}</span>
                  <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resolveCategoryName(c.name, c.name_key, categoryNameKeys)}</span>
                  <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', fontVariantNumeric: 'tabular-nums', minWidth: 32, textAlign: 'right' }}>{pct}%</span>
                  <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg)', fontVariantNumeric: 'tabular-nums', minWidth: 60, textAlign: 'right' }}>{fmt(c.total)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* POR PESSOA — já aberto quando há divisão. */}
      {hasSplit && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--arvo-border-soft)' }}>
          <SectionLabel>{tv.splitByPerson ?? 'Por pessoa'}</SectionLabel>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {users.map((u, i) => {
              const pct = cost.total > 0 ? Math.round((u.total / cost.total) * 100) : 0
              return (
                <div key={u.user_id} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <Avatar name={u.display?.name} email={u.display?.email} size={24} />
                  <div style={{ flex: 1, height: 4, borderRadius: 999, background: 'var(--arvo-border)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: USER_COLORS[i % USER_COLORS.length], borderRadius: 999 }} />
                  </div>
                  <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg)', fontVariantNumeric: 'tabular-nums', minWidth: 60, textAlign: 'right' }}>{fmt(u.total)}</span>
                  <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', minWidth: 32, textAlign: 'right' }}>{pct}%</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* POR LUGAR — secundário, recolhido por padrão. */}
      {hasPlaces && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--arvo-border-soft)' }}>
          <button type="button" onClick={() => setShowByPlace(v => !v)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            <SectionLabel>{tv.expenses?.byPlace ?? 'Por lugar'}</SectionLabel>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)' }}>
              {showByPlace ? (tv.actions?.collapse ?? 'Recolher') : `${places.length} ${tv.placesWord ?? 'lugares'}`}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ transform: showByPlace ? 'rotate(180deg)' : 'none', transition: 'transform 160ms' }}>
                <path strokeLinecap="round" d="M2 3.5l3 3 3-3" />
              </svg>
            </span>
          </button>
          {showByPlace && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {places.map(p => {
                const pct = cost.total > 0 ? (p.total / cost.total) * 100 : 0
                return (
                  <div key={p.trip_place_id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)', fontVariantNumeric: 'tabular-nums' }}>{fmt(p.total)}</span>
                    </div>
                    <div style={{ height: 3, borderRadius: 999, background: 'var(--arvo-border)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: 'var(--arvo-fg-soft)', borderRadius: 999, transition: 'width 300ms ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* TODAS AS TRANSAÇÕES — secundário, recolhido por padrão (evita poluir o card). */}
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--arvo-border-soft)' }}>
        <button type="button" onClick={toggleTransactions}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          <SectionLabel>{tv.allTransactions ?? 'Todas as transações'}</SectionLabel>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)' }}>
            {showTransactions ? (tv.actions?.collapse ?? 'Recolher') : (tv.actions?.expand ?? 'Expandir')}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ transform: showTransactions ? 'rotate(180deg)' : 'none', transition: 'transform 160ms' }}>
              <path strokeLinecap="round" d="M2 3.5l3 3 3-3" />
            </svg>
          </span>
        </button>
        {showTransactions && (
          <div style={{ marginTop: 12 }}>
            {loadingTx ? (
              <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)' }}>Carregando…</p>
            ) : txDisplayItems.length === 0 ? (
              <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)' }}>{tv.noTransactions ?? 'Nenhuma transação'}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--arvo-border-soft)', borderRadius: 10, overflow: 'hidden' }}>
                {txDisplayItems.map((item, i) => {
                  if (item.kind === 'group') {
                    const expanded = expandedGroups.has(item.groupId)
                    return (
                      <div key={`g-${item.groupId}`}>
                        <div
                          onClick={() => setExpandedGroups(prev => {
                            const next = new Set(prev)
                            next.has(item.groupId) ? next.delete(item.groupId) : next.add(item.groupId)
                            return next
                          })}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer', background: 'var(--arvo-hover-bg)', borderTop: i > 0 ? '1px solid var(--arvo-border-soft)' : 'none' }}
                        >
                          <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor" style={{ color: 'var(--arvo-fg-soft)', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 160ms', flexShrink: 0 }}>
                            <path d="M6 3.5L10.5 8 6 12.5V3.5z"/>
                          </svg>
                          <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                          <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)' }}>{item.txs.length}</span>
                          <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)', fontVariantNumeric: 'tabular-nums', minWidth: 56, textAlign: 'right' }}>{fmt(Math.abs(item.net))}</span>
                        </div>
                        {expanded && item.txs.map(tx => (
                          <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px 7px 26px', borderTop: '1px solid var(--arvo-border-soft)' }}>
                            <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', width: 44, flexShrink: 0 }}>{new Date(tx.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                            <span style={{ fontSize: 13, flexShrink: 0 }}>{tx.finance_categories?.icon ?? '❓'}</span>
                            <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</span>
                            <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)', fontVariantNumeric: 'tabular-nums' }}>{fmt(Math.abs(tx.amount))}</span>
                          </div>
                        ))}
                      </div>
                    )
                  }
                  const tx = item.tx
                  return (
                    <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderTop: i > 0 ? '1px solid var(--arvo-border-soft)' : 'none' }}>
                      <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', width: 44, flexShrink: 0 }}>{new Date(tx.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                      <span style={{ fontSize: 13, flexShrink: 0 }}>{tx.finance_categories?.icon ?? '❓'}</span>
                      <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</span>
                      <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: tx.amount < 0 ? 'var(--arvo-fg-soft)' : GREEN, fontVariantNumeric: 'tabular-nums' }}>{fmt(Math.abs(tx.amount))}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MOMENTOS VINCULADOS — rodapé discreto. */}
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--arvo-border-soft)' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
          <SectionLabel>{tv.linkedMoments ?? 'Momentos'}</SectionLabel>
          <Link to="/finances/moments" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', textDecoration: 'none', letterSpacing: '0.04em' }}>
            {tv.actions?.viewMoments ?? 'Ver momentos →'}
          </Link>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {cost.moments.map(m => (
            <div key={m.id} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 14 }}>{m.icon}</span>
                <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)' }}>{m.name}</span>
              </div>
              <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)', fontVariantNumeric: 'tabular-nums' }}>
                {fmt(m.spent)}
              </span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10 }}>
          <LinkMomentPanel tripId={tripId} onLinked={onCostChanged} compact />
        </div>
      </div>
    </div>
  )
}
