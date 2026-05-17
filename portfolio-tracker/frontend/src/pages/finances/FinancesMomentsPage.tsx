import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'

interface Moment {
  id: number
  name: string
  description: string | null
  icon: string
  color: string
  start_date: string | null
  end_date: string | null
  created_at: string
}

interface MomentDetail {
  moment: Moment
  transactions: { id: number; date: string; description: string; amount: number; currency: string; finance_categories: { name: string; icon: string; color: string } | null }[]
  summary: { total: number; by_category: { name: string; icon: string; color: string; total: number }[] }
}

interface MomentPickerRow {
  id: number; name: string; icon: string; color: string
}

const ICONS = ['✨', '✈️', '🎉', '🎂', '🏖️', '🏔️', '🎭', '🎵', '🍽️', '🏠', '💒', '🎓', '🛒', '⚽', '🎮', '🚗', '💊', '🎁']
const COLORS = ['#7C3AED', '#2563EB', '#16A34A', '#DC2626', '#D97706', '#0891B2', '#DB2777', '#65A30D', '#9333EA', '#EA580C']

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

// ── Form ──────────────────────────────────────────────────────────────────────

interface FormProps {
  initial?: Partial<Moment>
  onSave: (data: Omit<Moment, 'id' | 'created_at'>) => Promise<void>
  onCancel: () => void
  saving: boolean
}

function MomentForm({ initial, onSave, onCancel, saving }: FormProps) {
  const { t } = useI18n()
  const [name,       setName]       = useState(initial?.name ?? '')
  const [description,setDescription]= useState(initial?.description ?? '')
  const [icon,       setIcon]       = useState(initial?.icon ?? '✨')
  const [color,      setColor]      = useState(initial?.color ?? '#7C3AED')
  const [startDate,  setStartDate]  = useState(initial?.start_date ?? '')
  const [endDate,    setEndDate]    = useState(initial?.end_date ?? '')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await onSave({ name, description: description || null, icon, color, start_date: startDate || null, end_date: endDate || null })
  }

  const fieldCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20'
  const labelCls = 'block text-xs text-gray-500 mb-1'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={labelCls}>{t.common.name}</label>
          <input required value={name} onChange={e => setName(e.target.value)} className={fieldCls} placeholder="Viagem Paris, Aniversário João…" />
        </div>

        <div className="col-span-2">
          <label className={labelCls}>{t.common.description} (opcional)</label>
          <input value={description} onChange={e => setDescription(e.target.value)} className={fieldCls} />
        </div>

        <div className="col-span-2">
          <label className={labelCls}>{t.finances.momentIcon}</label>
          <div className="flex flex-wrap gap-1.5">
            {ICONS.map(ic => (
              <button
                key={ic} type="button"
                onClick={() => setIcon(ic)}
                className={`text-lg w-9 h-9 rounded-lg flex items-center justify-center border-2 transition-colors ${icon === ic ? 'border-[#001A70] bg-[#001A70]/10' : 'border-transparent bg-gray-100'}`}
              >{ic}</button>
            ))}
          </div>
        </div>

        <div className="col-span-2">
          <label className={labelCls}>{t.finances.momentColor}</label>
          <div className="flex gap-2">
            {COLORS.map(c => (
              <button
                key={c} type="button"
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                className={`w-7 h-7 rounded-full border-2 transition-all ${color === c ? 'border-gray-900 scale-110' : 'border-transparent'}`}
              />
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls}>Início (opcional)</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={fieldCls} />
        </div>
        <div>
          <label className={labelCls}>Fim (opcional)</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={fieldCls} />
        </div>
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={saving}
          className="flex-1 bg-[#001A70] text-white text-sm py-2 rounded-xl hover:opacity-80 transition-opacity disabled:opacity-40">
          {saving ? '…' : t.common.save}
        </button>
        <button type="button" onClick={onCancel} className="px-4 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          {t.common.cancel}
        </button>
      </div>
    </form>
  )
}

// ── Assign to moment modal ────────────────────────────────────────────────────

interface AssignModalProps {
  momentId: number
  moments: MomentPickerRow[]
  transactionId: number
  currentMomentId: number | null
  onDone: () => void
  onClose: () => void
}

function AssignModal({ momentId: _momentId, moments, transactionId, currentMomentId, onDone, onClose }: AssignModalProps) {
  const { t } = useI18n()
  const [saving, setSaving] = useState(false)

  async function assign(mid: number | null) {
    setSaving(true)
    try {
      await apiFetch(`/finances/transactions/${transactionId}`, { method: 'PATCH', body: JSON.stringify({ moment_id: mid }) })
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-gray-900 mb-3 text-sm">{t.finances.assignMoment}</h3>
        <div className="space-y-1">
          {moments.map(m => (
            <button key={m.id} disabled={saving}
              onClick={() => assign(m.id === currentMomentId ? null : m.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${m.id === currentMomentId ? 'bg-[#001A70]/10 text-[#001A70]' : 'hover:bg-gray-50 text-gray-700'}`}>
              <span className="text-base">{m.icon}</span>
              <span>{m.name}</span>
              {m.id === currentMomentId && <span className="ml-auto text-xs">✓</span>}
            </button>
          ))}
          {currentMomentId && (
            <button disabled={saving} onClick={() => assign(null)}
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-50 transition-colors">
              {t.finances.noMoment}
            </button>
          )}
        </div>
        <button onClick={onClose} className="mt-3 w-full text-center text-xs text-gray-400 hover:text-gray-600 transition-colors">
          {t.common.cancel}
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FinancesMomentsPage() {
  const { t } = useI18n()
  const [moments,     setMoments]     = useState<Moment[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [editing,     setEditing]     = useState<Moment | null>(null)
  const [saving,      setSaving]      = useState(false)
  const [expanded,    setExpanded]    = useState<number | null>(null)
  const [detail,      setDetail]      = useState<MomentDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [pickerMoments, setPickerMoments] = useState<MomentPickerRow[]>([])
  const [assignTarget,  setAssignTarget]  = useState<{ txId: number; currentMomentId: number | null } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [data, picker] = await Promise.all([
        apiFetch<Moment[]>('/finances/moments'),
        apiFetch<MomentPickerRow[]>('/finances/moments-for-picker'),
      ])
      setMoments(data)
      setPickerMoments(picker)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function loadDetail(id: number) {
    setDetailLoading(true)
    try {
      const d = await apiFetch<MomentDetail>(`/finances/moments/${id}`)
      setDetail(d)
    } finally {
      setDetailLoading(false)
    }
  }

  function toggleExpand(id: number) {
    if (expanded === id) {
      setExpanded(null)
      setDetail(null)
    } else {
      setExpanded(id)
      setDetail(null)
      loadDetail(id)
    }
  }

  async function saveMoment(data: Omit<Moment, 'id' | 'created_at'>) {
    setSaving(true)
    try {
      if (editing) {
        await apiFetch(`/finances/moments/${editing.id}`, { method: 'PATCH', body: JSON.stringify(data) })
      } else {
        await apiFetch('/finances/moments', { method: 'POST', body: JSON.stringify(data) })
      }
      setShowForm(false)
      setEditing(null)
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function deleteMoment(id: number) {
    if (!confirm(t.finances.momentConfirmDelete)) return
    await apiFetch(`/finances/moments/${id}`, { method: 'DELETE' })
    if (expanded === id) { setExpanded(null); setDetail(null) }
    await load()
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400 text-sm">
        {t.common.loading}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t.finances.momentsTitle}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{t.finances.momentsSubtitle}</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true) }}
          className="px-3 py-1.5 bg-[#001A70] text-white text-sm rounded-lg hover:opacity-80 transition-opacity"
        >
          + {t.finances.newMoment}
        </button>
      </div>

      {/* Create/edit form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-semibold text-gray-900 mb-4 text-sm">
            {editing ? t.finances.editMoment : t.finances.newMoment}
          </h3>
          <MomentForm
            initial={editing ?? undefined}
            onSave={saveMoment}
            onCancel={() => { setShowForm(false); setEditing(null) }}
            saving={saving}
          />
        </div>
      )}

      {/* Empty state */}
      {moments.length === 0 && !showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-4xl mb-4">✨</p>
          <p className="text-gray-700 font-medium mb-1">{t.finances.momentEmptyTitle}</p>
          <p className="text-sm text-gray-400 mb-5">{t.finances.momentEmptyBody}</p>
          <button
            onClick={() => setShowForm(true)}
            className="px-5 py-2 bg-[#001A70] text-white text-sm rounded-xl hover:opacity-80 transition-opacity"
          >
            {t.finances.momentCreateFirst}
          </button>
        </div>
      )}

      {/* Moments list */}
      <div className="space-y-3">
        {moments.map(m => (
          <div key={m.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Moment header */}
            <div
              className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => toggleExpand(m.id)}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ backgroundColor: m.color + '20' }}>
                {m.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm truncate">{m.name}</p>
                {(m.start_date || m.description) && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {m.start_date && m.end_date
                      ? `${fmtDate(m.start_date)} – ${fmtDate(m.end_date)}`
                      : m.start_date
                      ? `a partir de ${fmtDate(m.start_date)}`
                      : m.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={e => { e.stopPropagation(); setEditing(m); setShowForm(true) }}
                  className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors rounded-lg hover:bg-gray-100"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button
                  onClick={e => { e.stopPropagation(); deleteMoment(m.id) }}
                  className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded === m.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {/* Expanded detail */}
            {expanded === m.id && (
              <div className="border-t border-gray-100 px-5 py-4 space-y-4">
                {detailLoading && <p className="text-center text-sm text-gray-400">{t.common.loading}</p>}
                {detail && detail.moment.id === m.id && (
                  <>
                    {/* Summary */}
                    <div className="flex items-center gap-4 flex-wrap">
                      <div>
                        <p className="text-xs text-gray-400">{t.finances.momentTotal}</p>
                        <p className="text-xl font-bold text-gray-900">
                          {fmt(detail.summary.total, detail.transactions[0]?.currency ?? 'EUR')}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">{t.finances.momentTransactions}</p>
                        <p className="text-xl font-bold text-gray-700">{detail.transactions.filter(tx => tx.amount < 0).length}</p>
                      </div>
                    </div>

                    {/* Category breakdown */}
                    {detail.summary.by_category.length > 0 && (
                      <div className="space-y-1.5">
                        {detail.summary.by_category.map(cat => {
                          const pct = detail.summary.total > 0 ? (cat.total / detail.summary.total) * 100 : 0
                          return (
                            <div key={cat.name} className="flex items-center gap-2">
                              <span className="text-sm w-5 text-center">{cat.icon}</span>
                              <span className="text-xs text-gray-600 w-28 truncate">{cat.name}</span>
                              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: cat.color }} />
                              </div>
                              <span className="text-xs text-gray-500 w-16 text-right">
                                {fmt(cat.total, detail.transactions[0]?.currency ?? 'EUR')}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Transactions */}
                    {detail.transactions.length > 0 ? (
                      <div className="space-y-0 border border-gray-100 rounded-xl overflow-hidden">
                        {detail.transactions.map((tx, i) => (
                          <div key={tx.id} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                            <span className="text-gray-400 text-xs w-16 shrink-0">{fmtDate(tx.date)}</span>
                            <span className="text-xs">{tx.finance_categories?.icon ?? '❓'}</span>
                            <span className="flex-1 text-gray-700 truncate text-xs">{tx.description}</span>
                            <span className={`text-xs font-semibold ${tx.amount < 0 ? 'text-gray-900' : 'text-emerald-600'}`}>
                              {fmt(Math.abs(tx.amount), tx.currency)}
                            </span>
                            <button
                              onClick={() => setAssignTarget({ txId: tx.id, currentMomentId: m.id })}
                              className="ml-1 p-1 text-gray-300 hover:text-[#001A70] transition-colors"
                              title={t.finances.assignMoment}
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a0 0 0 010 0V7a4 4 0 014-4z" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 text-center py-4">
                        Nenhuma transação neste Momento ainda.
                        Vá em <strong>Transações</strong> e atribua gastos a este Momento.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Assign modal */}
      {assignTarget && (
        <AssignModal
          momentId={assignTarget.currentMomentId ?? 0}
          moments={pickerMoments}
          transactionId={assignTarget.txId}
          currentMomentId={assignTarget.currentMomentId}
          onDone={async () => { setAssignTarget(null); await loadDetail(expanded!) }}
          onClose={() => setAssignTarget(null)}
        />
      )}
    </div>
  )
}
