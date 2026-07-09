import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import { useI18n } from '../contexts/I18nContext'
import { PageLoader } from '../components/ArvoLoader'

// Aba "Planos & Acessos" do /admin. Duas partes:
//  1. Matriz efetiva completa (gates + quotas, INCLUINDO Beta e cotas exatas),
//     editável por linha com "restaurar padrão" e badge "alterado" quando
//     difere do default versionado.
//  2. Métricas de interesse ("avisar quando abrir"): total, por gate e recentes.
//
// Consome:
//   GET    /entitlements/admin        → { gates[], quotas[], interest{...} }
//   PUT    /entitlements/admin/:key   → grava override
//   DELETE /entitlements/admin/:key   → restaura default
// Contrato em docs/TIERS_PLAN.md. O backend está sendo construído em paralelo;
// esta tela é escrita contra o contrato e degrada com elegância se ele faltar.

const OCRE = '#E8A020'
const TIERS = ['free', 'plus', 'pro', 'beta'] as const
type Tier = typeof TIERS[number]
type GateTier = 'free' | 'plus' | 'pro'

interface GateRow {
  key: string
  requiredTier: GateTier       // efetivo (default ou override)
  defaultTier: GateTier        // versionado em código
  overridden: boolean
}
interface QuotaRow {
  key: string
  period: 'live' | 'day' | 'month'
  limits: Record<Tier, number | null>          // efetivo
  defaultLimits: Record<Tier, number | null>   // versionado
  overridden: boolean
}
interface InterestByGate {
  gate: string
  count: number
  required_tier: string | null
  last_click: string | null
}
interface InterestRecent {
  gate: string
  user_name: string | null
  user_email: string | null
  created_at: string
}
interface AdminData {
  gates: GateRow[]
  quotas: QuotaRow[]
  interest: {
    total: number
    by_gate: InterestByGate[]
    recent: InterestRecent[]
  }
}

const card: React.CSSProperties = { background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 12 }

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: OCRE, background: 'rgba(232,160,32,0.12)', borderRadius: 6, padding: '2px 6px', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

export default function PlansAdminPage() {
  const { t, locale } = useI18n()
  const s = ((t as any).admin?.plans ?? {}) as Record<string, any>
  const rows = ((t as any).upgrade?.rows ?? {}) as Record<string, string>
  const intlLocale = locale === 'pt' ? 'pt-BR' : locale === 'fr' ? 'fr-FR' : 'en-US'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [data, setData] = useState<AdminData | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  function load() {
    setLoading(true)
    apiFetch<AdminData>('/entitlements/admin')
      .then(d => { setData(d); setError(false) })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const label = (key: string) => rows[key] ?? key

  async function saveGate(row: GateRow, requiredTier: GateTier) {
    if (!confirm((s.confirmSave ?? 'Aplicar "{feature}" = {tier}?').replace('{feature}', label(row.key)).replace('{tier}', requiredTier))) return
    setSavingKey(row.key)
    try {
      await apiFetch(`/entitlements/admin/${row.key}`, { method: 'PUT', body: JSON.stringify({ kind: 'gate', value: { requiredTier } }) })
      load()
    } catch { alert(s.saveError ?? 'Não foi possível salvar.') } finally { setSavingKey(null) }
  }

  async function saveQuota(row: QuotaRow, limits: Record<Tier, number | null>) {
    if (!confirm((s.confirmSaveQuota ?? 'Aplicar novos limites de "{feature}"?').replace('{feature}', label(row.key)))) return
    setSavingKey(row.key)
    try {
      await apiFetch(`/entitlements/admin/${row.key}`, { method: 'PUT', body: JSON.stringify({ kind: 'quota', value: limits }) })
      load()
    } catch { alert(s.saveError ?? 'Não foi possível salvar.') } finally { setSavingKey(null) }
  }

  async function restore(key: string) {
    if (!confirm((s.confirmRestore ?? 'Restaurar o padrão de "{feature}"?').replace('{feature}', label(key)))) return
    setSavingKey(key)
    try {
      await apiFetch(`/entitlements/admin/${key}`, { method: 'DELETE' })
      load()
    } catch { alert(s.saveError ?? 'Não foi possível salvar.') } finally { setSavingKey(null) }
  }

  if (loading) return <PageLoader />
  if (error || !data) {
    return (
      <div style={{ ...card, padding: 24 }}>
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg-muted)' }}>
          {s.loadError ?? 'Não foi possível carregar os planos. (O backend de entitlements pode ainda não estar disponível localmente.)'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* ── Matriz efetiva ── */}
      <section className="space-y-3">
        <div>
          <h2 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 18, color: 'var(--arvo-fg)' }}>{s.matrixTitle ?? 'Matriz efetiva'}</h2>
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)', marginTop: 2 }}>
            {s.matrixSubtitle ?? 'Tier requerido por gate e limites por cota. Vazio = ilimitado (∞).'}
          </p>
        </div>

        {/* Gates */}
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--arvo-border-soft)', fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }}>
            {s.gatesLabel ?? 'Gates'}
          </div>
          {data.gates.map(row => (
            <div key={row.key} className="flex items-center gap-3 flex-wrap" style={{ padding: '11px 14px', borderTop: '1px solid var(--arvo-border-soft)' }}>
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg)' }}>{label(row.key)}</span>
                <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-faint)' }}>{row.key}</span>
                {row.overridden && <Badge>{s.changed ?? 'alterado'}</Badge>}
              </div>
              <select
                value={row.requiredTier}
                disabled={savingKey === row.key}
                onChange={e => saveGate(row, e.target.value as GateTier)}
                style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--arvo-border)', background: 'var(--arvo-surface)', color: 'var(--arvo-fg)' }}
              >
                <option value="free">{s.gateFree ?? 'Liberado (free)'}</option>
                <option value="plus">Plus</option>
                <option value="pro">Pro</option>
              </select>
              {row.overridden && (
                <button
                  onClick={() => restore(row.key)}
                  disabled={savingKey === row.key}
                  style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
                >
                  {s.restore ?? 'restaurar padrão'}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Quotas */}
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--arvo-border-soft)', fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }}>
            {s.quotasLabel ?? 'Cotas'}  ·  {s.quotasHint ?? 'vazio = ∞'}
          </div>
          {data.quotas.map(row => <QuotaRowEditor key={row.key} row={row} label={label(row.key)} saving={savingKey === row.key} onSave={saveQuota} onRestore={restore} s={s} />)}
        </div>
      </section>

      {/* ── Métricas de interesse ── */}
      <section className="space-y-3">
        <div className="flex items-baseline gap-3">
          <h2 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 18, color: 'var(--arvo-fg)' }}>{s.interestTitle ?? 'Interesse registrado'}</h2>
          <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)' }}>
            {(s.interestTotal ?? '{n} no total').replace('{n}', String(data.interest.total))}
          </span>
        </div>

        <div style={{ ...card, overflow: 'hidden' }}>
          <div className="flex items-center gap-3" style={{ padding: '9px 14px', borderBottom: '1px solid var(--arvo-border-soft)', fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }}>
            <span className="flex-1">{s.colGate ?? 'Gate'}</span>
            <span style={{ width: 60, textAlign: 'right' }}>{s.colCount ?? 'Cliques'}</span>
            <span style={{ width: 70, textAlign: 'right' }}>{s.colTier ?? 'Tier'}</span>
            <span style={{ width: 100, textAlign: 'right' }}>{s.colLast ?? 'Último'}</span>
          </div>
          {data.interest.by_gate.length === 0 ? (
            <div style={{ padding: '18px 14px', fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-faint)' }}>{s.noInterest ?? 'Nenhum interesse ainda.'}</div>
          ) : data.interest.by_gate.map(g => (
            <div key={g.gate} className="flex items-center gap-3" style={{ padding: '10px 14px', borderTop: '1px solid var(--arvo-border-soft)' }}>
              <span className="flex-1 min-w-0" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg)' }}>{label(g.gate)}</span>
              <span style={{ width: 60, textAlign: 'right', fontFamily: 'var(--arvo-font-body)', fontSize: 14, fontWeight: 600, color: 'var(--arvo-fg)' }}>{g.count}</span>
              <span style={{ width: 70, textAlign: 'right', fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)' }}>{g.required_tier ?? '—'}</span>
              <span style={{ width: 100, textAlign: 'right', fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)' }}>
                {g.last_click ? new Date(g.last_click).toLocaleDateString(intlLocale, { day: '2-digit', month: 'short' }) : '—'}
              </span>
            </div>
          ))}
        </div>

        <div>
          <h3 style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)', marginBottom: 8 }}>
            {s.recentTitle ?? 'Últimos 50 registros'}
          </h3>
          <div style={{ ...card, overflow: 'hidden' }}>
            {data.interest.recent.length === 0 ? (
              <div style={{ padding: '18px 14px', fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-faint)' }}>{s.noInterest ?? 'Nenhum interesse ainda.'}</div>
            ) : data.interest.recent.map((r, i) => (
              <div key={i} className="flex items-center gap-3" style={{ padding: '9px 14px', borderTop: i === 0 ? 'none' : '1px solid var(--arvo-border-soft)' }}>
                <span className="flex-1 min-w-0" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.user_name ?? r.user_email ?? '—'}
                </span>
                <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)' }}>{label(r.gate)}</span>
                <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-faint)', whiteSpace: 'nowrap' }}>
                  {new Date(r.created_at).toLocaleDateString(intlLocale, { day: '2-digit', month: 'short' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

// Editor de uma linha de cota: um input por tier (vazio = ∞). Botão salvar só
// aparece quando há mudança pendente vs. o valor efetivo atual.
function QuotaRowEditor({ row, label, saving, onSave, onRestore, s }: {
  row: QuotaRow
  label: string
  saving: boolean
  onSave: (row: QuotaRow, limits: Record<Tier, number | null>) => void
  onRestore: (key: string) => void
  s: Record<string, any>
}) {
  const toStr = (v: number | null) => v === null ? '' : String(v)
  const [draft, setDraft] = useState<Record<Tier, string>>({
    free: toStr(row.limits.free), plus: toStr(row.limits.plus), pro: toStr(row.limits.pro), beta: toStr(row.limits.beta),
  })

  const dirty = TIERS.some(t => toStr(row.limits[t]) !== draft[t].trim())

  function commit() {
    const limits = {} as Record<Tier, number | null>
    for (const t of TIERS) {
      const raw = draft[t].trim()
      limits[t] = raw === '' ? null : Number(raw)
    }
    onSave(row, limits)
  }

  return (
    <div className="flex items-center gap-3 flex-wrap" style={{ padding: '11px 14px', borderTop: '1px solid var(--arvo-border-soft)' }}>
      <div className="flex items-center gap-2" style={{ minWidth: 180, flex: 1 }}>
        <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, color: 'var(--arvo-fg-faint)' }}>/{row.period}</span>
        {row.overridden && <Badge>{s.changed ?? 'alterado'}</Badge>}
      </div>
      <div className="flex items-center gap-2">
        {TIERS.map(t => (
          <label key={t} className="flex flex-col items-center" style={{ gap: 2 }}>
            <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--arvo-fg-faint)' }}>{t}</span>
            <input
              value={draft[t]}
              inputMode="numeric"
              placeholder="∞"
              disabled={saving}
              onChange={e => setDraft(d => ({ ...d, [t]: e.target.value.replace(/[^0-9]/g, '') }))}
              style={{ width: 54, textAlign: 'center', fontFamily: 'var(--arvo-font-body)', fontSize: 14, padding: '6px 4px', borderRadius: 8, border: '1px solid var(--arvo-border)', background: 'var(--arvo-surface)', color: 'var(--arvo-fg)' }}
            />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        {dirty && (
          <button
            onClick={commit}
            disabled={saving}
            style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, letterSpacing: '0.04em', padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--arvo-fg)', color: 'var(--arvo-pill-active-fg)', cursor: 'pointer' }}
          >
            {s.save ?? 'Salvar'}
          </button>
        )}
        {row.overridden && (
          <button
            onClick={() => onRestore(row.key)}
            disabled={saving}
            style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
          >
            {s.restore ?? 'restaurar padrão'}
          </button>
        )}
      </div>
    </div>
  )
}
