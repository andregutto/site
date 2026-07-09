import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '../../contexts/I18nContext'
import { PageLoader } from '../../components/ArvoLoader'
import { apiFetch } from '../../lib/api'
import InstitutionLogo from '../../components/InstitutionLogo'
import AddAccountModal, { type FinanceAccount, fmtBalance, relativeTime } from '../../components/AddAccountModal'

// Contas (Finanças): visão enxuta das contas agrupadas por instituição —
// só instituições que TÊM conta + criar conta. A visão completa por
// instituição (com ativos do portfólio) segue em /institutions, dentro do
// Patrimônio (gated). Esta página não toca nenhum endpoint de portfólio,
// então funciona pra todos os tiers.
export default function AccountsPage() {
  const { t } = useI18n()
  const f = t.finances

  const [accounts,  setAccounts]  = useState<FinanceAccount[]>([])
  const [loading,   setLoading]   = useState(true)
  const [addModal,  setAddModal]  = useState(false)
  const [addSaving, setAddSaving] = useState(false)

  const loadAccounts = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<FinanceAccount[]>('/finances/accounts')
      setAccounts(data)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadAccounts() }, [loadAccounts])

  async function handleAddAccount(data: { name: string; currency: string; institution_name: string; color: string; icon: string }) {
    setAddSaving(true)
    try {
      await apiFetch('/finances/accounts', { method: 'POST', body: JSON.stringify({ ...data, create_asset: true }) })
      setAddModal(false)
      await loadAccounts()
    } finally { setAddSaving(false) }
  }

  async function deleteAccount(accountId: number) {
    if (!confirm(f.institutionsDeleteAccountConfirm)) return
    await apiFetch(`/finances/accounts/${accountId}`, { method: 'DELETE' })
    loadAccounts()
  }

  if (loading) return <PageLoader />

  // Agrupa por instituição (case-insensitive, mesmo critério da página
  // Instituições); contas sem instituição ficam num grupo próprio no fim.
  const groups = new Map<string, { name: string; accounts: FinanceAccount[] }>()
  for (const acc of accounts) {
    const raw = acc.institution_name?.trim() || ''
    const key = raw ? raw.toLowerCase() : '__none__'
    if (!groups.has(key)) groups.set(key, { name: raw, accounts: [] })
    groups.get(key)!.accounts.push(acc)
  }
  const ordered = [...groups.values()].sort((a, b) => {
    if (!a.name) return 1
    if (!b.name) return -1
    return a.name.localeCompare(b.name)
  })

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--arvo-fg)]">{f.accountsPageTitle}</h1>
          <p className="text-sm text-[var(--arvo-fg-muted)] mt-1">{f.accountsPageSubtitle}</p>
        </div>
        <button
          onClick={() => setAddModal(true)}
          className="bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] text-sm px-4 py-2 rounded-xl hover:opacity-80"
        >
          + {f.addAccount}
        </button>
      </div>

      {ordered.length === 0 && (
        <div className="border border-dashed border-[var(--arvo-border)] rounded-2xl px-6 py-12 text-center">
          <p className="text-sm text-[var(--arvo-fg-muted)]">{f.accountsPageEmpty}</p>
        </div>
      )}

      <div className="space-y-4">
        {ordered.map(group => (
          <div key={group.name || '__none__'} className="border border-[var(--arvo-border)] rounded-2xl overflow-hidden bg-[var(--arvo-surface)]">
            <div className="px-5 py-3 flex items-center gap-3 bg-[var(--arvo-surface-2)]/60">
              {group.name
                ? <InstitutionLogo name={group.name} size={22} />
                : <span className="text-lg">💼</span>}
              <p className="text-sm font-semibold text-[var(--arvo-fg)] flex-1">
                {group.name || f.institutionsNoInstitution}
              </p>
              <span className="text-xs text-[var(--arvo-fg-soft)]">
                {group.accounts.length === 1 ? f.accountsPageOne : f.accountsPageMany.replace('{n}', String(group.accounts.length))}
              </span>
            </div>

            {group.accounts.map(acc => (
              <div key={acc.id} className="px-5 py-3 flex items-center gap-3 border-t border-[var(--arvo-border)]">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ backgroundColor: acc.color + '25' }}>
                  {acc.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[var(--arvo-fg)] truncate">{acc.name}</p>
                    <span className="text-xs px-1.5 py-0.5 rounded-md bg-[var(--arvo-track-bg)] text-[var(--arvo-fg-muted)]">{acc.currency}</span>
                  </div>
                  <p className={`text-base font-bold tabular-nums ${acc.balance < 0 ? 'text-red-600' : 'text-[var(--arvo-fg)]'}`}>
                    {fmtBalance(acc.balance, acc.currency)}
                  </p>
                  {acc.bank_connection && (
                    <p className="text-xs text-[var(--arvo-fg-soft)]">
                      🔗 {acc.bank_connection.display_name ?? f.institutionsBankConnected} · {f.lastSync}: {relativeTime(acc.bank_connection.last_synced_at, f.neverSynced)}
                    </p>
                  )}
                </div>
                <button onClick={() => deleteAccount(acc.id)} className="p-1.5 text-[var(--arvo-fg-faint)] hover:text-red-500 transition-colors shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>

      {addModal && (
        <AddAccountModal
          onSave={handleAddAccount}
          onClose={() => setAddModal(false)}
          saving={addSaving}
        />
      )}
    </div>
  )
}
