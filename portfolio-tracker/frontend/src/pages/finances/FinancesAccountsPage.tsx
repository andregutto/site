import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'

interface FinanceAccount {
  id: number
  name: string
  currency: string
  institution_name: string | null
  linked_asset_id: number | null
  color: string
  icon: string
  balance: number
  bank_connection: { id: number; display_name: string | null; last_synced_at: string | null } | null
  created_at: string
}

const ACCOUNT_ICONS = ['🏦', '🏧', '💳', '💰', '💵', '💶', '💷', '🪙', '📱', '🏠', '✈️', '💼']
const ACCOUNT_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#001A70', '#64748b']
const CURRENCIES = ['EUR', 'BRL', 'USD', 'GBP', 'CHF']

function relativeTime(iso: string | null, neverLabel: string) {
  if (!iso) return neverLabel
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return '<1m'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('default', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

// ── Account form modal ────────────────────────────────────────────────────────

interface AccountFormProps {
  initial?: Partial<FinanceAccount>
  institutionName?: string
  onSave: (data: { name: string; currency: string; institution_name: string | null; color: string; icon: string }) => Promise<void>
  onClose: () => void
  saving: boolean
  title: string
}

function AccountForm({ initial, institutionName, onSave, onClose, saving, title }: AccountFormProps) {
  const { t } = useI18n()
  const [name,     setName]     = useState(initial?.name ?? institutionName ?? '')
  const [currency, setCurrency] = useState(initial?.currency ?? 'EUR')
  const [instName, setInstName] = useState(initial?.institution_name ?? institutionName ?? '')
  const [color,    setColor]    = useState(initial?.color ?? '#6366f1')
  const [icon,     setIcon]     = useState(initial?.icon ?? '🏦')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await onSave({ name: name.trim(), currency, institution_name: instName.trim() || null, color, icon })
  }

  const labelCls = 'text-xs font-medium text-gray-500 mb-1 block'
  const fieldCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20'

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelCls}>{t.common.name}</label>
            <input required value={name} onChange={e => setName(e.target.value)} className={fieldCls} placeholder={t.finances.accountNamePlaceholder} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t.finances.accountCurrency}</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} className={fieldCls}>
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t.finances.accountInstitution}</label>
              <input value={instName} onChange={e => setInstName(e.target.value)} className={fieldCls} placeholder="Revolut, NuBank…" />
            </div>
          </div>

          <div>
            <label className={labelCls}>Ícone</label>
            <div className="flex flex-wrap gap-1.5">
              {ACCOUNT_ICONS.map(ic => (
                <button key={ic} type="button" onClick={() => setIcon(ic)}
                  className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-colors ${icon === ic ? 'ring-2 ring-[#001A70] bg-[#001A70]/10' : 'bg-gray-50 hover:bg-gray-100'}`}
                >{ic}</button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>Cor</label>
            <div className="flex gap-2 flex-wrap">
              {ACCOUNT_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-transform ${color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className="flex-1 bg-[#001A70] text-white text-sm py-2.5 rounded-xl hover:opacity-80 disabled:opacity-40">
              {saving ? '…' : t.common.save}
            </button>
            <button type="button" onClick={onClose} className="px-4 text-sm text-gray-500 hover:text-gray-700">
              {t.common.cancel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FinancesAccountsPage() {
  const { t } = useI18n()
  const [searchParams] = useSearchParams()
  const [accounts,    setAccounts]    = useState<FinanceAccount[]>([])
  const [institutions, setInstitutions] = useState<string[]>([])
  const [loading,     setLoading]     = useState(true)
  const [banner,      setBanner]      = useState<'connected' | 'error' | null>(null)
  const [syncing,     setSyncing]     = useState<number | null>(null)
  const [syncResult,  setSyncResult]  = useState<{ id: number; imported: number; merged?: number } | null>(null)
  const [connecting,  setConnecting]  = useState(false)
  const [formMode,    setFormMode]    = useState<{ mode: 'new' | 'edit'; account?: FinanceAccount; prefill?: string } | null>(null)
  const [saving,      setSaving]      = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [accts, insts] = await Promise.all([
        apiFetch<FinanceAccount[]>('/finances/accounts'),
        apiFetch<string[]>('/finances/accounts/portfolio-institutions'),
      ])
      setAccounts(accts)
      setInstitutions(insts)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (searchParams.get('connected') === '1') setBanner('connected')
    if (searchParams.get('error'))             setBanner('error')
  }, [searchParams])

  async function connectBank() {
    setConnecting(true)
    try {
      const { url } = await apiFetch<{ url: string }>('/banks/auth')
      window.location.href = url
    } catch { setConnecting(false) }
  }

  async function syncConnection(connId: number, accountId: number) {
    setSyncing(accountId)
    setSyncResult(null)
    try {
      const r = await apiFetch<{ imported: number; merged: number; total: number }>(`/banks/sync/${connId}`, { method: 'POST' })
      setSyncResult({ id: accountId, imported: r.imported, merged: r.merged })
      await load()
    } finally { setSyncing(null) }
  }

  async function disconnectBank(connId: number) {
    if (!confirm(t.finances.disconnect + '?')) return
    await apiFetch(`/banks/connections/${connId}`, { method: 'DELETE' })
    await load()
  }

  async function deleteAccount(id: number) {
    if (!confirm(t.finances.accountDeleteConfirm)) return
    await apiFetch(`/finances/accounts/${id}`, { method: 'DELETE' })
    await load()
  }

  async function saveAccount(data: { name: string; currency: string; institution_name: string | null; color: string; icon: string }) {
    setSaving(true)
    try {
      if (formMode?.mode === 'edit' && formMode.account) {
        await apiFetch(`/finances/accounts/${formMode.account.id}`, { method: 'PATCH', body: JSON.stringify(data) })
      } else {
        await apiFetch('/finances/accounts', { method: 'POST', body: JSON.stringify(data) })
      }
      setFormMode(null)
      await load()
    } finally { setSaving(false) }
  }

  async function activateInstitution(name: string) {
    setFormMode({ mode: 'new', prefill: name })
  }

  const totalBalance = accounts.reduce((sum, a) => {
    if (a.currency === 'EUR') return sum + a.balance
    return sum
  }, 0)

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t.finances.accountsPageTitle}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{t.finances.accountsPageSubtitle}</p>
        </div>
        <button
          onClick={() => setFormMode({ mode: 'new' })}
          className="px-3 py-1.5 bg-[#001A70] text-white text-sm rounded-lg hover:opacity-80 transition-opacity"
        >+ {t.finances.addAccount}</button>
      </div>

      {/* Banners */}
      {banner === 'connected' && (
        <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          ✅ <span>{t.finances.connectedSuccess}</span>
          <button onClick={() => setBanner(null)} className="ml-auto text-emerald-400 hover:text-emerald-600">×</button>
        </div>
      )}
      {banner === 'error' && (
        <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          ⚠️ <span>{t.finances.connectError}</span>
          <button onClick={() => setBanner(null)} className="ml-auto text-red-400 hover:text-red-600">×</button>
        </div>
      )}

      {loading && (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400 text-sm animate-pulse">
          {t.common.loading}
        </div>
      )}

      {/* Accounts list */}
      {!loading && accounts.length > 0 && (
        <div className="space-y-3">
          {accounts.map(acc => (
            <div key={acc.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-5 flex items-start gap-4">
                {/* Icon */}
                <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl shrink-0 mt-0.5"
                  style={{ backgroundColor: acc.color + '20' }}>
                  {acc.icon}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 text-sm">{acc.name}</p>
                    <span className="text-xs px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500">{acc.currency}</span>
                    {acc.institution_name && (
                      <span className="text-xs px-1.5 py-0.5 rounded-md border border-gray-200 text-gray-400">{acc.institution_name}</span>
                    )}
                  </div>
                  <p className={`text-xl font-bold mt-1 ${acc.balance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {fmt(acc.balance, acc.currency)}
                  </p>
                  {syncResult?.id === acc.id && (
                    <p className="text-xs text-emerald-600 mt-0.5">
                      {syncResult.imported} importadas{syncResult.merged ? `, ${syncResult.merged} mescladas` : ''}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => setFormMode({ mode: 'edit', account: acc })}
                    className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50 transition-colors" title="Editar">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </button>
                  <button onClick={() => deleteAccount(acc.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors" title="Excluir">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>

              {/* Bank connection row */}
              <div className="border-t border-gray-50 px-5 py-3 flex items-center gap-3 bg-gray-50/50">
                {acc.bank_connection ? (
                  <>
                    <span className="text-xs text-gray-400 flex-1">
                      🔗 {acc.bank_connection.display_name ?? 'Banco conectado'} · {t.finances.lastSync}: {relativeTime(acc.bank_connection.last_synced_at, t.finances.neverSynced)}
                    </span>
                    <button onClick={() => syncConnection(acc.bank_connection!.id, acc.id)} disabled={syncing === acc.id}
                      className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-white transition-colors disabled:opacity-50">
                      {syncing === acc.id ? t.finances.syncing : t.finances.syncNow}
                    </button>
                    <button onClick={() => disconnectBank(acc.bank_connection!.id)}
                      className="px-2.5 py-1 text-xs border border-red-100 rounded-lg text-red-500 hover:bg-red-50 transition-colors">
                      {t.finances.disconnect}
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-gray-400 flex-1">{t.finances.bankConnectionsBody}</span>
                    <button onClick={connectBank} disabled={connecting}
                      className="px-2.5 py-1 text-xs border border-[#001A70]/20 rounded-lg text-[#001A70] hover:bg-[#001A70]/5 transition-colors disabled:opacity-50">
                      {connecting ? '…' : t.finances.connectBank}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && accounts.length === 0 && institutions.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-4xl mb-4">🏦</p>
          <p className="text-gray-700 font-medium mb-1">{t.finances.accountEmpty}</p>
          <p className="text-sm text-gray-400 mb-5">{t.finances.accountEmptyBody}</p>
          <button onClick={() => setFormMode({ mode: 'new' })}
            className="px-5 py-2 bg-[#001A70] text-white text-sm rounded-xl hover:opacity-80 transition-opacity">
            + {t.finances.addAccount}
          </button>
        </div>
      )}

      {/* From portfolio section */}
      {!loading && institutions.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">{t.finances.accountFromPortfolio}</p>
            <p className="text-xs text-gray-400 mt-0.5">{t.finances.accountFromPortfolioSub}</p>
          </div>
          <div className="space-y-2">
            {institutions.map(inst => (
              <div key={inst} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-500">
                    {inst.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-sm text-gray-700">{inst}</span>
                </div>
                <button onClick={() => activateInstitution(inst)}
                  className="px-3 py-1 text-xs bg-[#001A70] text-white rounded-lg hover:opacity-80 transition-opacity">
                  + {t.finances.accountActivate}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Form modal */}
      {formMode && (
        <AccountForm
          initial={formMode.account}
          institutionName={formMode.prefill}
          onSave={saveAccount}
          onClose={() => setFormMode(null)}
          saving={saving}
          title={formMode.mode === 'edit' ? t.finances.accountEditTitle : t.finances.accountNewTitle}
        />
      )}
    </div>
  )
}
