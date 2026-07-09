import { useState } from 'react'
import { useI18n } from '../contexts/I18nContext'
import InstitutionSelect from './InstitutionSelect'

// Modal de criação de conta + tipo/formatadores de conta, compartilhados entre
// a página Instituições (Patrimônio) e a página Contas (Finanças).

export interface FinanceAccount {
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

export const ACCOUNT_ICONS = ['🏦', '🏧', '💳', '💰', '💵', '💶', '💷', '🪙', '📱', '🏠', '✈️', '💼']
export const ACCOUNT_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#0D0D0D', '#64748b']
export const CURRENCIES = ['EUR', 'BRL', 'USD', 'GBP', 'CHF']

export function fmtBalance(n: number, currency: string) {
  return new Intl.NumberFormat('default', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

export function relativeTime(iso: string | null, neverLabel: string) {
  if (!iso) return neverLabel
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return '<1m'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

interface AddAccountModalProps {
  prefillInstitution?: string
  onSave: (data: { name: string; currency: string; institution_name: string; color: string; icon: string }) => Promise<void>
  onClose: () => void
  saving: boolean
}

export default function AddAccountModal({ prefillInstitution, onSave, onClose, saving }: AddAccountModalProps) {
  const { t } = useI18n()
  const f = t.finances

  const [name,     setName]     = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [instName, setInstName] = useState(prefillInstitution ?? '')
  const [color,    setColor]    = useState('#0D0D0D')
  const [icon,     setIcon]     = useState('🏦')

  const fieldCls = 'w-full border border-[var(--arvo-border)] rounded-[3px] px-3 py-2 text-sm bg-[var(--arvo-surface)] text-[var(--arvo-fg)] focus:outline-none focus:border-[var(--arvo-gold)] focus:ring-2 focus:ring-[var(--arvo-gold)]/25'
  const labelCls = 'text-xs font-medium text-[var(--arvo-fg-muted)] mb-1 block'

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-[var(--arvo-surface)] w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-[var(--arvo-fg)]">{f.addAccount}</h3>
          <button onClick={onClose} className="text-[var(--arvo-fg-soft)] hover:text-[var(--arvo-fg-muted)]">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <p className="text-xs text-[var(--arvo-fg-soft)] bg-[var(--arvo-surface-2)] rounded-lg px-3 py-2">
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
                  className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-colors ${icon === ic ? 'ring-2 ring-[var(--arvo-fg)] bg-[var(--arvo-fg)]/10' : 'bg-[var(--arvo-surface-2)] hover:bg-[var(--arvo-track-bg)]'}`}
                >{ic}</button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>{f.institutionsColor}</label>
            <div className="flex gap-2 flex-wrap">
              {ACCOUNT_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-transform ${color === c ? 'ring-2 ring-offset-2 ring-[var(--arvo-fg-faint)] scale-110' : 'hover:scale-105'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className="flex-1 bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] text-sm py-2.5 rounded-xl hover:opacity-80 disabled:opacity-40">
              {saving ? '…' : f.institutionsCreateAccount}
            </button>
            <button type="button" onClick={onClose} className="px-4 text-sm text-[var(--arvo-fg-muted)] hover:text-[var(--arvo-fg)]">{t.common.cancel}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
