import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useAuth } from '../../contexts/AuthContext'
import { useI18n } from '../../contexts/I18nContext'
import { useCurrency } from '../../contexts/CurrencyContext'
import { Icon } from '../../components/icons'
import { resolveMomentIcon } from '../../lib/momentIcons'
import {
  _fmt, fmtDate, resolveKey, ByUserBreakdown, MomentCollaboratorsHero, TransformToTripButton,
  ShareModal, AssignModal, MembersPanel, MomentForm,
} from './FinancesMomentsPage'
import type { Moment, MomentDetail, MomentPickerRow, ShareInfo, MomentFormData } from './FinancesMomentsPage'

const RED = '#D63B2F'

// Collapsible section — same pattern as Voyage's CostCard (SectionLabel + chevron, starts
// expanded) so "quem pagou o quê" / categorias / transações read as distinct blocks instead
// of one long stacked list.
function Section({ title, meta, defaultOpen = true, children }: { title: string; meta?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderTop: '1px solid var(--arvo-border-soft)', paddingTop: 14 }}>
      <button
        type="button" onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
      >
        <span style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }}>{title}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-soft)' }}>
          {meta}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 160ms' }}>
            <path strokeLinecap="round" d="M2 3.5l3 3 3-3" />
          </svg>
        </span>
      </button>
      {open && <div style={{ marginTop: 12 }}>{children}</div>}
    </div>
  )
}

export default function MomentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useI18n()
  const { user } = useAuth()
  const { hideValues } = useCurrency()
  const fmt = (n: number, currency: string) => hideValues ? '•••' : _fmt(n, currency)
  const nameKeys: Record<string, string> = {
    categoryTransfer: t.finances.categoryTransfer, categorySalary: t.finances.categorySalary,
    categoryUncategorized: t.finances.categoryUncategorized, categoryGroceries: t.finances.categoryGroceries,
    categoryRestaurant: t.finances.categoryRestaurant, categoryTransport: t.finances.categoryTransport,
    categoryHealth: t.finances.categoryHealth, categoryEntertainment: t.finances.categoryEntertainment,
    categoryHousing: t.finances.categoryHousing, categoryStreaming: t.finances.categoryStreaming,
    categorySubscriptions: t.finances.categorySubscriptions, categoryPharmacy: t.finances.categoryPharmacy,
    categoryClothing: t.finances.categoryClothing, categoryTravel: t.finances.categoryTravel,
    categoryCoffee: t.finances.categoryCoffee, categoryUtilities: t.finances.categoryUtilities,
    categoryEducation: t.finances.categoryEducation, categoryPersonalCare: t.finances.categoryPersonalCare,
    categoryElectronics: t.finances.categoryElectronics, categoryAirbnb: t.finances.categoryAirbnb,
    categoryOther: t.finances.categoryOther, categoryGifts: t.finances.categoryGifts,
    categoryShopping: t.finances.categoryShopping, categoryTaxes: t.finances.categoryTaxes,
    categoryFees: t.finances.categoryFees, categoryBarsRestaurants: t.finances.categoryBarsRestaurants,
    categoryShowsParties: t.finances.categoryShowsParties, categoryPhone: t.finances.categoryPhone,
    categoryInvestment: t.finances.categoryInvestment,
  }

  const [detail, setDetail] = useState<MomentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [pickerMoments, setPickerMoments] = useState<MomentPickerRow[]>([])
  const [assignTarget, setAssignTarget] = useState<{ txId: number; currentMomentId: number | null } | null>(null)
  const [sharingMoment, setSharingMoment] = useState<Moment | null>(null)
  const [showMembers, setShowMembers] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [showEditForm, setShowEditForm] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const [d, picker] = await Promise.all([
        apiFetch<MomentDetail>(`/finances/moments/${id}`),
        apiFetch<MomentPickerRow[]>('/finances/moments-for-picker'),
      ])
      setDetail(d)
      setPickerMoments(picker)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  async function deleteMoment() {
    if (!id || !confirm(t.finances.momentConfirmDelete)) return
    await apiFetch(`/finances/moments/${id}`, { method: 'DELETE' })
    navigate('/finances/moments')
  }

  async function saveEdit(data: MomentFormData) {
    if (!id) return
    setSavingEdit(true)
    try {
      await apiFetch(`/finances/moments/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
      setShowEditForm(false)
      await load()
    } finally {
      setSavingEdit(false)
    }
  }

  if (loading) {
    return (
      <div className="py-6">
        <div style={{ height: 160, borderRadius: 18, background: 'var(--arvo-hover-bg)', animation: 'pulse 1.5s ease infinite' }} />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="py-12 text-center">
        <p style={{ fontFamily: 'var(--arvo-font-body)', color: 'var(--arvo-fg-soft)' }}>{t.finances.momentEmptyTitle}</p>
      </div>
    )
  }

  const { moment: m, transactions, summary, reimbursement_groups } = detail
  const currency = transactions[0]?.currency ?? 'EUR'

  // Reimbursement groups are one unit everywhere else in the app (Transactions page) — show
  // them collapsed here too instead of as N separate rows split across the moment's list.
  type DisplayItem =
    | { kind: 'tx'; tx: typeof transactions[number] }
    | { kind: 'group'; groupId: string; name: string; txs: typeof transactions; net: number }
  const displayItems: DisplayItem[] = []
  const seenGroups = new Set<string>()
  for (const tx of transactions) {
    if (tx.reimbursement_group_id) {
      if (seenGroups.has(tx.reimbursement_group_id)) continue
      seenGroups.add(tx.reimbursement_group_id)
      const groupTxs = transactions.filter(t => t.reimbursement_group_id === tx.reimbursement_group_id)
      const net = groupTxs.reduce((s, t) => s + t.amount, 0)
      displayItems.push({ kind: 'group', groupId: tx.reimbursement_group_id, name: reimbursement_groups[tx.reimbursement_group_id] ?? t.finances.reimbursementGroup, txs: groupTxs, net })
    } else {
      displayItems.push({ kind: 'tx', tx })
    }
  }
  const isOwner = m.user_id === user?.id

  return (
    <div className="py-6">
      {/* Back + ações — mesmo padrão da página de detalhe de viagem */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
        <button
          onClick={() => navigate('/finances/moments')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', padding: 0, flexShrink: 0 }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" d="M9 2L4 7l5 5" />
          </svg>
          {t.finances.momentsTitle}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <TransformToTripButton momentId={m.id} linkedTripId={m.linked_trip_id} onTrip={tripId => navigate(`/voyage/${tripId}`)} />
          {isOwner && (
            <button
              onClick={() => setSharingMoment(m)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: `1px solid ${m.share_token ? 'rgba(31,138,91,0.45)' : 'var(--arvo-border)'}`, borderRadius: 7, padding: '5px 11px', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-muted)' }}
            >
              {t.finances.shareTitle}
            </button>
          )}
          <button
            onClick={() => setShowEditForm(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: '1px solid var(--arvo-border)', borderRadius: 7, padding: '5px 11px', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-muted)' }}
          >
            {t.common.edit}
          </button>
          <button
            onClick={deleteMoment}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: '1px solid var(--arvo-border)', borderRadius: 7, padding: '5px 11px', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: RED }}
          >
            {t.common.delete}
          </button>
        </div>
      </div>

      {/* Hero */}
      <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', marginBottom: 24 }}>
        {m.cover_image_url ? (
          <div className="h-52 sm:h-44" style={{ position: 'relative', overflow: 'hidden' }}>
            <img src={m.cover_image_url} alt={m.name} className="w-full h-full object-cover"
              style={{ objectPosition: m.cover_image_position ?? '50% 50%' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(13,13,13,0.75) 0%, rgba(13,13,13,0.10) 55%, transparent 100%)' }} />
            <div style={{ position: 'absolute', bottom: 16, right: 16 }}>
              <MomentCollaboratorsHero momentId={m.id} onOpen={() => setShowMembers(true)} />
            </div>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '20px 24px 22px', pointerEvents: 'none' }}>
              <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 26, letterSpacing: '0.06em', color: '#fff', lineHeight: 1.2 }}>
                {m.name}
              </h1>
            </div>
          </div>
        ) : (
          <div className="h-32 flex items-center justify-center relative" style={{ background: 'var(--arvo-surface-2)' }}>
            <Icon name={resolveMomentIcon(m.icon)} size={40} style={{ color: m.color }} />
            <div style={{ position: 'absolute', bottom: 12, right: 12 }}>
              <MomentCollaboratorsHero momentId={m.id} onOpen={() => setShowMembers(true)} />
            </div>
            <div style={{ position: 'absolute', top: 12, left: 16 }}>
              <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 22, letterSpacing: '0.04em', color: 'var(--arvo-fg)' }}>
                {m.name}
              </h1>
            </div>
          </div>
        )}
      </div>

      {(m.start_date || m.description) && (
        <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 12.5, color: 'var(--arvo-fg-soft)', letterSpacing: '0.01em', marginBottom: 20 }}>
          {m.start_date && m.end_date
            ? `${fmtDate(m.start_date)} – ${fmtDate(m.end_date)}`
            : m.start_date
            ? `${t.finances.momentFromDate} ${fmtDate(m.start_date)}`
            : m.description}
        </p>
      )}

      {showEditForm && (
        <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm p-6 mb-4">
          <h3 className="font-semibold text-[var(--arvo-fg)] mb-4 text-sm">{t.finances.editMoment}</h3>
          <MomentForm
            initial={m}
            onSave={saveEdit}
            onCancel={() => setShowEditForm(false)}
            saving={savingEdit}
            userId={user?.id ?? ''}
          />
        </div>
      )}

      <div className="space-y-4">
        {/* Summary. Budget gets its own full-width row below the stats instead of squeezing
            into the leftover space beside them — that read as cramped/jumbled on mobile, where
            there's barely any width left next to the large 3xl total/count numbers. */}
        <div className="flex items-center gap-5">
          <div>
            <p className="text-sm text-[var(--arvo-fg-soft)]">{t.finances.momentTotal}</p>
            <p className="text-3xl font-bold text-[var(--arvo-fg)]">{fmt(summary.total, currency)}</p>
          </div>
          <div>
            <p className="text-sm text-[var(--arvo-fg-soft)]">{t.finances.momentTransactions}</p>
            <p className="text-3xl font-bold text-[var(--arvo-fg)]">{transactions.filter(tx => tx.amount < 0).length}</p>
          </div>
        </div>

        {m.budget != null && (() => {
          const spent = summary.total
          const pct = Math.min(100, (spent / m.budget!) * 100)
          const over = spent > m.budget!
          return (
            <div>
              <div className="flex justify-between text-xs mb-1.5" style={{ color: over ? 'var(--arvo-red)' : 'var(--arvo-fg-muted)' }}>
                <span className="font-medium">{t.finances.momentBudget}</span>
                <span>{fmt(spent, currency)} {t.finances.momentBudgetOf} {fmt(m.budget!, currency)}{over ? ` · ${t.finances.momentBudgetOver}` : ` · ${pct.toFixed(0)}%`}</span>
              </div>
              <div className="h-2 bg-[var(--arvo-track-bg)] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct.toFixed(1)}%`, backgroundColor: over ? 'var(--arvo-red)' : m.color }} />
              </div>
            </div>
          )
        })()}

        {summary.by_user.length > 1 && (
          <Section title={t.finances.momentByUserTitle}>
            <ByUserBreakdown byUser={summary.by_user} total={summary.total} currency={currency} fmt={fmt} hideLabel />
          </Section>
        )}

        {summary.by_category.length > 0 && (
          <Section title={t.finances.momentSectionCategories} meta={String(summary.by_category.length)}>
            <div className="space-y-1.5">
              {summary.by_category.map(cat => {
                const pct = summary.total > 0 ? (cat.total / summary.total) * 100 : 0
                return (
                  <div key={cat.name} className="flex items-center gap-2">
                    <span className="text-sm w-5 text-center">{cat.icon}</span>
                    <span className="text-xs text-[var(--arvo-fg-muted)] w-28 truncate">{resolveKey(cat.name, cat.name_key, nameKeys)}</span>
                    <div className="flex-1 h-1.5 bg-[var(--arvo-track-bg)] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: cat.color }} />
                    </div>
                    <span className="text-xs text-[var(--arvo-fg-muted)] w-16 text-right">{fmt(cat.total, currency)}</span>
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        <Section title={t.finances.momentSectionTransactions} meta={transactions.length > 0 ? String(transactions.length) : undefined}>
        {transactions.length > 0 ? (
          <div className="space-y-0 border border-[var(--arvo-border)] rounded-xl overflow-hidden">
            {displayItems.map((item, i) => {
              if (item.kind === 'group') {
                const expanded = expandedGroups.has(item.groupId)
                return (
                  <div key={`group-${item.groupId}`}>
                    <div
                      className={`flex items-center gap-2.5 px-4 py-2.5 text-sm cursor-pointer hover:bg-[var(--arvo-surface-2)] transition-colors ${i > 0 ? 'border-t border-[var(--arvo-border-soft)]' : ''}`}
                      onClick={() => setExpandedGroups(prev => {
                        const next = new Set(prev)
                        next.has(item.groupId) ? next.delete(item.groupId) : next.add(item.groupId)
                        return next
                      })}
                    >
                      <svg className={`w-3 h-3 text-[var(--arvo-fg-soft)] transition-transform shrink-0 ${expanded ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 16 16">
                        <path d="M6 3.5L10.5 8 6 12.5V3.5z"/>
                      </svg>
                      <Icon name="repeat" size={12} style={{ color: 'var(--arvo-fg-soft)' }} />
                      <span className="text-[var(--arvo-fg)] text-xs font-medium flex-1 truncate">{item.name}</span>
                      <span className="text-[10px] text-[var(--arvo-fg-soft)]">{item.txs.length} transações</span>
                      <span className={`text-xs font-semibold shrink-0 ${Math.abs(item.net) < 0.01 ? 'text-[var(--arvo-fg-soft)]' : item.net > 0 ? 'text-emerald-600' : 'text-[var(--arvo-fg)]'}`}>
                        {fmt(Math.abs(item.net), item.txs[0]?.currency)}
                      </span>
                    </div>
                    {expanded && item.txs.map(tx => (
                      <div key={tx.id} className="flex items-center gap-3 pl-9 pr-4 py-2 text-sm border-t border-[var(--arvo-border-soft)] bg-[var(--arvo-track-bg)]">
                        <span className="text-[var(--arvo-fg-soft)] text-xs w-16 shrink-0">{fmtDate(tx.date)}</span>
                        <span className="text-xs">{tx.finance_categories?.icon ?? '❓'}</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-[var(--arvo-fg)] truncate text-xs block">{tx.description}</span>
                        </div>
                        <span className={`text-xs font-semibold shrink-0 ${tx.amount < 0 ? 'text-[var(--arvo-fg)]' : 'text-emerald-600'}`}>
                          {fmt(Math.abs(tx.amount), tx.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              }
              const tx = item.tx
              return (
                <div key={tx.id} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${i > 0 ? 'border-t border-[var(--arvo-border-soft)]' : ''}`}>
                  <span className="text-[var(--arvo-fg-soft)] text-xs w-16 shrink-0">{fmtDate(tx.date)}</span>
                  <span className="text-xs">{tx.finance_categories?.icon ?? '❓'}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-[var(--arvo-fg)] truncate text-xs block">{tx.description}</span>
                    {tx.notes && <span className="text-[10px] text-[var(--arvo-fg-soft)] italic truncate block">{tx.notes}</span>}
                  </div>
                  <span className={`text-xs font-semibold shrink-0 ${tx.amount < 0 ? 'text-[var(--arvo-fg)]' : 'text-emerald-600'}`}>
                    {fmt(Math.abs(tx.amount), tx.currency)}
                  </span>
                  <button
                    onClick={() => setAssignTarget({ txId: tx.id, currentMomentId: m.id })}
                    className="ml-1 p-1 text-[var(--arvo-fg-faint)] hover:text-[var(--arvo-fg)] transition-colors"
                    title={t.finances.assignMoment}
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a0 0 0 010 0V7a4 4 0 014-4z" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-[var(--arvo-fg-soft)] text-center py-4">{t.finances.momentNoTransactions}</p>
        )}
        </Section>
      </div>

      {sharingMoment && (
        <ShareModal
          moment={sharingMoment}
          onClose={() => setSharingMoment(null)}
          onRevoke={() => setDetail(d => d ? { ...d, moment: { ...d.moment, share_token: null, share_expires_at: null } } : d)}
          onUpdate={(info: ShareInfo) => {
            setDetail(d => d ? { ...d, moment: { ...d.moment, ...info } } : d)
            setSharingMoment(prev => prev ? { ...prev, ...info } : null)
          }}
        />
      )}

      {showMembers && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowMembers(false) }}
        >
          <div
            className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-[18px] sm:rounded-[18px]"
            style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border-soft)', boxShadow: 'var(--arvo-shadow-lg)' }}
          >
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--arvo-border-soft)' }}>
              <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 13, letterSpacing: '0.10em', color: 'var(--arvo-fg)' }}>
                {t.finances.momentCollaboratorsTitle}
              </p>
              <button
                type="button" onClick={() => setShowMembers(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--arvo-fg-soft)', padding: 4 }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" d="M3 3l10 10M13 3L3 13" />
                </svg>
              </button>
            </div>
            <div style={{ padding: 20 }}>
              <MembersPanel momentId={m.id} ownerId={m.user_id} />
            </div>
          </div>
        </div>
      )}

      {assignTarget && (
        <AssignModal
          momentId={assignTarget.currentMomentId ?? 0}
          moments={pickerMoments}
          transactionId={assignTarget.txId}
          currentMomentId={assignTarget.currentMomentId}
          onDone={async () => { setAssignTarget(null); await load() }}
          onClose={() => setAssignTarget(null)}
        />
      )}
    </div>
  )
}
