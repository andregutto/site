import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { usePortfolioValue } from '../hooks/usePortfolio'
import { useCurrency } from '../contexts/CurrencyContext'
import { useI18n } from '../contexts/I18nContext'
import { apiFetch } from '../lib/api'
import InstitutionLogo from '../components/InstitutionLogo'
import InstitutionSelect from '../components/InstitutionSelect'

const NO_INST = '__no_institution__'

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
}

const ACCOUNT_ICONS = ['🏦', '🏧', '💳', '💰', '💵', '💶', '💷', '🪙', '📱', '🏠', '✈️', '💼']
const ACCOUNT_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#001A70', '#64748b']
const CURRENCIES = ['EUR', 'BRL', 'USD', 'GBP', 'CHF']

function fmtBalance(n: number, currency: string) {
  return new Intl.NumberFormat('default', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

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

// ── Add account modal ─────────────────────────────────────────────────────────

interface AddAccountModalProps {
  prefillInstitution?: string
  onSave: (data: { name: string; currency: string; institution_name: string; color: string; icon: string }) => Promise<void>
  onClose: () => void
  saving: boolean
}

function AddAccountModal({ prefillInstitution, onSave, onClose, saving }: AddAccountModalProps) {
  const { t } = useI18n()
  const f = t.finances

  const [name,     setName]     = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [instName, setInstName] = useState(prefillInstitution ?? '')
  const [color,    setColor]    = useState('#001A70')
  const [icon,     setIcon]     = useState('🏦')

  const fieldCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20'
  const labelCls = 'text-xs font-medium text-gray-500 mb-1 block'

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">{f.addAccount}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
          {f.institutionsAutoAssetNote}
        </p>

        <form onSubmit={e => { e.preventDefault(); onSave({ name: name.trim(), currency, institution_name: instName.trim(), color, icon }) }} className="space-y-3">
          <div>
            <label className={labelCls}>{f.accountInstitution}</label>
            <InstitutionSelect value={instName} onChange={setInstName} placeholder="Revolut, NuBank…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{f.institutionsAccountNameLabel}</label>
              <input required value={name} onChange={e => setName(e.target.value)} className={fieldCls} placeholder={f.accountNamePlaceholder} />
            </div>
            <div>
              <label className={labelCls}>{f.accountCurrency}</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} className={fieldCls}>
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>{f.institutionsIcon}</label>
            <div className="flex flex-wrap gap-1.5">
              {ACCOUNT_ICONS.map(ic => (
                <button key={ic} type="button" onClick={() => setIcon(ic)}
                  className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-colors ${icon === ic ? 'ring-2 ring-[#001A70] bg-[#001A70]/10' : 'bg-gray-50 hover:bg-gray-100'}`}
                >{ic}</button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>{f.institutionsColor}</label>
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
              {saving ? '…' : f.institutionsCreateAccount}
            </button>
            <button type="button" onClick={onClose} className="px-4 text-sm text-gray-500 hover:text-gray-700">{t.common.cancel}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InstitutionPage() {
  const { data: portfolio, loading: portfolioLoading, refresh: refreshPortfolio } = usePortfolioValue()
  const { fmt } = useCurrency()
  const { t } = useI18n()
  const f = t.finances
  const navigate = useNavigate()

  const [accounts,         setAccounts]         = useState<FinanceAccount[]>([])
  const [accountsLoading,  setAccountsLoading]  = useState(true)
  const [expanded,         setExpanded]         = useState<Set<string>>(new Set())
  const [editingId,        setEditingId]        = useState<number | null>(null)
  const [editingValue,     setEditingValue]     = useState('')
  const [moveSaving,       setMoveSaving]       = useState(false)
  const [addModal,         setAddModal]         = useState<{ institution?: string } | null>(null)
  const [addSaving,        setAddSaving]        = useState(false)
  const [syncingPortfolio, setSyncingPortfolio] = useState<number | null>(null)
  const [syncOkId,         setSyncOkId]         = useState<number | null>(null)
  const [connecting,       setConnecting]       = useState(false)
  const [syncingBank,      setSyncingBank]      = useState<number | null>(null)
  const [linkModal,        setLinkModal]        = useState<number | null>(null)
  const [linkSaving,       setLinkSaving]       = useState(false)

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true)
    try {
      const data = await apiFetch<FinanceAccount[]>('/finances/accounts')
      setAccounts(data)
    } finally { setAccountsLoading(false) }
  }, [])

  useEffect(() => { loadAccounts() }, [loadAccounts])

  async function handleMoveAsset(assetId: number) {
    setMoveSaving(true)
    try {
      await apiFetch(`/assets/${assetId}`, { method: 'PATCH', body: JSON.stringify({ exchange: editingValue.trim() || null }) })
      setEditingId(null)
      refreshPortfolio()
    } finally { setMoveSaving(false) }
  }

  async function handleAddAccount(data: { name: string; currency: string; institution_name: string; color: string; icon: string }) {
    setAddSaving(true)
    try {
      await apiFetch('/finances/accounts', {
        method: 'POST',
        body: JSON.stringify({ ...data, create_asset: true }),
      })
      setAddModal(null)
      await Promise.all([loadAccounts(), refreshPortfolio()])
    } finally { setAddSaving(false) }
  }

  async function syncToPortfolio(accountId: number) {
    setSyncingPortfolio(accountId)
    try {
      await apiFetch(`/finances/accounts/${accountId}/sync-portfolio`, { method: 'POST' })
      setSyncOkId(accountId)
      setTimeout(() => setSyncOkId(null), 3000)
      refreshPortfolio()
    } finally { setSyncingPortfolio(null) }
  }

  async function unlinkAccount(accountId: number) {
    await apiFetch(`/finances/accounts/${accountId}`, { method: 'PATCH', body: JSON.stringify({ linked_asset_id: null }) })
    loadAccounts()
  }

  async function linkToAsset(accountId: number, assetId: number) {
    setLinkSaving(true)
    try {
      await apiFetch(`/finances/accounts/${accountId}`, { method: 'PATCH', body: JSON.stringify({ linked_asset_id: assetId }) })
      setLinkModal(null)
      loadAccounts()
      syncToPortfolio(accountId)
    } finally { setLinkSaving(false) }
  }

  async function deleteAccount(accountId: number) {
    if (!confirm(f.institutionsDeleteAccountConfirm)) return
    await apiFetch(`/finances/accounts/${accountId}`, { method: 'DELETE' })
    loadAccounts()
  }

  async function connectBank() {
    setConnecting(true)
    try {
      const { url } = await apiFetch<{ url: string }>('/banks/auth')
      window.location.href = url
    } catch { setConnecting(false) }
  }

  async function syncBank(connId: number, accountId: number) {
    setSyncingBank(accountId)
    try {
      await apiFetch(`/banks/sync/${connId}`, { method: 'POST' })
      loadAccounts()
    } finally { setSyncingBank(null) }
  }

  async function disconnectBank(connId: number) {
    if (!confirm(f.institutionsDisconnectConfirm)) return
    await apiFetch(`/banks/connections/${connId}`, { method: 'DELETE' })
    loadAccounts()
  }

  function toggle(name: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const loading = portfolioLoading || accountsLoading

  if (loading) {
    return <div className="text-center text-gray-400 text-sm py-12 animate-pulse">{t.common.loading}</div>
  }

  if (!portfolio) return null

  type AssetItem = (typeof portfolio.by_asset)[number]

  const groupMap = new Map<string, AssetItem[]>()
  for (const asset of portfolio.by_asset) {
    const key = asset.exchange?.trim() || NO_INST
    if (!groupMap.has(key)) groupMap.set(key, [])
    groupMap.get(key)!.push(asset)
  }

  const accountsByInst = new Map<string, FinanceAccount[]>()
  for (const acc of accounts) {
    const key = (acc.institution_name ?? '').toLowerCase().trim()
    if (key) {
      if (!accountsByInst.has(key)) accountsByInst.set(key, [])
      accountsByInst.get(key)!.push(acc)
    }
  }

  interface Group {
    name: string
    assets: AssetItem[]
    accounts: FinanceAccount[]
    total: number
  }

  const groups: Group[] = [...groupMap.entries()].map(([name, assets]) => ({
    name,
    assets: [...assets].sort((a, b) => b.value_brl - a.value_brl),
    accounts: name === NO_INST ? [] : (accountsByInst.get(name.toLowerCase()) ?? []),
    total: assets.reduce((s, a) => s + a.value_brl, 0),
  }))

  const coveredInsts = new Set([...groupMap.keys()].map(k => k.toLowerCase()))
  for (const acc of accounts) {
    const key = (acc.institution_name ?? '').toLowerCase().trim()
    if (key && !coveredInsts.has(key)) {
      coveredInsts.add(key)
      groups.push({ name: acc.institution_name!, assets: [], accounts: [acc], total: 0 })
    }
  }

  groups.sort((a, b) => {
    if (a.name === NO_INST) return 1
    if (b.name === NO_INST) return -1
    return b.total - a.total
  })

  function groupLabel(name: string) {
    return name === NO_INST ? f.institutionsNoInstitution : name
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t.nav.institutions}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{f.institutionsSubtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/institutions/profiles"
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-500 hover:text-[#001A70] hover:border-[#001A70]/30 transition-colors"
          >{f.institutionsLegalProfiles}</Link>
          <button
            onClick={() => setAddModal({})}
            className="px-3 py-1.5 bg-[#001A70] text-white text-sm rounded-lg hover:opacity-80 transition-opacity"
          >+ {f.addAccount}</button>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center text-gray-400 shadow-sm">
          <p className="text-4xl mb-4">🏦</p>
          <p className="text-gray-700 font-medium mb-1">{f.institutionsNone}</p>
          <p className="text-sm text-gray-400 mb-5">{f.institutionsNoneBody}</p>
          <button onClick={() => setAddModal({})} className="px-5 py-2 bg-[#001A70] text-white text-sm rounded-xl hover:opacity-80">
            + {f.addAccount}
          </button>
        </div>
      ) : (
        groups.map(group => {
          const isOpen = expanded.has(group.name)
          const hasPortfolio = group.assets.length > 0
          const hasAccount = group.accounts.length > 0
          const na = group.assets.length
          const nc = group.accounts.length

          return (
            <div key={group.name} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              <button
                onClick={() => toggle(group.name)}
                className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {group.name !== NO_INST && <InstitutionLogo name={group.name} size={36} />}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-gray-800">{groupLabel(group.name)}</h2>
                      <span className="text-gray-300 text-xs">{isOpen ? '▲' : '▼'}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {hasPortfolio && `${na} ${na !== 1 ? f.institutionsAssets : f.institutionsAsset}`}
                      {hasPortfolio && hasAccount && ' · '}
                      {hasAccount && `${nc} ${nc !== 1 ? f.institutionsAccountPlural : f.institutionsAccountSingular}`}
                      {hasPortfolio && portfolio.total_brl > 0 && ` · ${((group.total / portfolio.total_brl) * 100).toFixed(1)}% ${f.institutionsOfPortfolio}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  {group.total > 0 && <p className="font-bold text-gray-900">{fmt(group.total)}</p>}
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-gray-100">

                  {group.assets.length > 0 && (
                    <div className="divide-y divide-gray-50">
                      {group.assets.map(asset => (
                        <div key={asset.id} className="px-5 py-3 flex items-center gap-3">
                          {editingId === asset.id ? (
                            <>
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: asset.class_color }} />
                              <span className="text-sm font-medium text-gray-800 shrink-0 w-16">{asset.code}</span>
                              <div className="flex-1">
                                <InstitutionSelect value={editingValue} onChange={setEditingValue} placeholder={f.accountInstitution} autoFocus />
                              </div>
                              <button onClick={() => handleMoveAsset(asset.id)} disabled={moveSaving} className="text-xs text-[#001A70] font-semibold disabled:opacity-50 shrink-0">OK</button>
                              <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 shrink-0">✕</button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => navigate(`/assets/${asset.id}`, { state: { total_brl: portfolio.total_brl } })}
                                className="flex-1 flex items-center gap-3 text-left min-w-0"
                              >
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: asset.class_color }} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-800">{asset.code}</p>
                                  <p className="text-xs text-gray-400 truncate">{asset.name}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-sm font-semibold text-gray-900">{fmt(asset.value_brl)}</p>
                                  <p className="text-xs text-gray-400">
                                    {portfolio.total_brl > 0 ? ((asset.value_brl / portfolio.total_brl) * 100).toFixed(1) : '0'}%
                                  </p>
                                </div>
                              </button>
                              <button
                                onClick={() => { setEditingId(asset.id); setEditingValue(asset.exchange ?? '') }}
                                className="text-xs text-gray-400 hover:text-[#001A70] border border-gray-200 hover:border-[#001A70] rounded-lg px-2.5 py-1 transition-colors shrink-0"
                              >{f.institutionsMoveAsset}</button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {group.accounts.map(acc => (
                    <div key={acc.id} className="border-t border-gray-100 bg-blue-50/30">
                      <div className="px-5 py-3 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ backgroundColor: acc.color + '25' }}>
                          {acc.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-800">{acc.name}</p>
                            <span className="text-xs px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500">{acc.currency}</span>
                            {acc.linked_asset_id && (
                              <span className="text-xs text-emerald-600 flex items-center gap-0.5">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                                {f.institutionsLinked}
                              </span>
                            )}
                          </div>
                          <p className={`text-lg font-bold ${acc.balance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                            {fmtBalance(acc.balance, acc.currency)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {acc.linked_asset_id ? (
                            <>
                              <button
                                onClick={() => syncToPortfolio(acc.id)}
                                disabled={syncingPortfolio === acc.id}
                                className="px-2.5 py-1 text-xs border border-emerald-200 rounded-lg text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                              >
                                {syncingPortfolio === acc.id ? '…' : syncOkId === acc.id ? f.institutionsSynced : f.syncNow}
                              </button>
                              <button onClick={() => unlinkAccount(acc.id)} className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg text-gray-400 hover:text-red-500 hover:border-red-100 transition-colors">
                                {f.institutionsUnlink}
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setLinkModal(acc.id)}
                              className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg text-gray-500 hover:text-[#001A70] hover:border-[#001A70]/30 transition-colors"
                            >{f.institutionsNotLinked} →</button>
                          )}
                          <button onClick={() => deleteAccount(acc.id)} className="p-1.5 text-gray-300 hover:text-red-500 transition-colors">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </div>

                      <div className="px-5 py-2 flex items-center gap-3 bg-gray-50/60 border-t border-gray-100/60">
                        {acc.bank_connection ? (
                          <>
                            <span className="text-xs text-gray-400 flex-1">
                              🔗 {acc.bank_connection.display_name ?? f.institutionsBankConnected} · {f.lastSync}: {relativeTime(acc.bank_connection.last_synced_at, f.neverSynced)}
                            </span>
                            <button onClick={() => syncBank(acc.bank_connection!.id, acc.id)} disabled={syncingBank === acc.id}
                              className="px-2.5 py-1 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-white transition-colors disabled:opacity-50">
                              {syncingBank === acc.id ? '…' : f.syncNow}
                            </button>
                            <button onClick={() => disconnectBank(acc.bank_connection!.id)}
                              className="px-2.5 py-1 text-xs border border-red-100 rounded-lg text-red-500 hover:bg-red-50 transition-colors">
                              {f.disconnect}
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="text-xs text-gray-400 flex-1">{f.institutionsNoBank}</span>
                            <button onClick={connectBank} disabled={connecting}
                              className="px-2.5 py-1 text-xs border border-[#001A70]/20 rounded-lg text-[#001A70] hover:bg-[#001A70]/5 transition-colors disabled:opacity-50">
                              {connecting ? '…' : f.connectBank}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}

                  {group.name !== NO_INST && group.accounts.length === 0 && (
                    <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-between bg-gray-50/40">
                      <span className="text-xs text-gray-400">{f.institutionsNoFinanceAccount}</span>
                      <button
                        onClick={() => setAddModal({ institution: group.name })}
                        className="px-2.5 py-1 text-xs border border-[#001A70]/20 rounded-lg text-[#001A70] hover:bg-[#001A70]/5 transition-colors"
                      >+ {f.addAccount}</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}

      {addModal && (
        <AddAccountModal
          prefillInstitution={addModal.institution}
          onSave={handleAddAccount}
          onClose={() => setAddModal(null)}
          saving={addSaving}
        />
      )}

      {linkModal !== null && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setLinkModal(null)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">{f.institutionsLinked}</h3>
              <button onClick={() => setLinkModal(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-xs text-gray-400">{f.institutionsAutoAssetNote}</p>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {portfolio.by_asset.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">{f.institutionsNone}</p>
              ) : (
                portfolio.by_asset.map(asset => (
                  <button
                    key={asset.id}
                    onClick={() => linkToAsset(linkModal, asset.id)}
                    disabled={linkSaving}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-blue-50 hover:border-[#001A70]/20 border border-gray-100 text-left transition-colors disabled:opacity-50"
                  >
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: asset.class_color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{asset.code}</p>
                      <p className="text-xs text-gray-400 truncate">{asset.name}</p>
                    </div>
                    <p className="text-sm font-semibold text-gray-700 shrink-0">{fmt(asset.value_brl)}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
