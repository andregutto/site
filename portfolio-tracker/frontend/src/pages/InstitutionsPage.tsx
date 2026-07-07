import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { PageLoader } from '../components/ArvoLoader'
import { apiFetch } from '../lib/api'
import { usePortfolioValue } from '../hooks/usePortfolio'
import InstitutionLogo from '../components/InstitutionLogo'
import { DatePicker } from '../components/ui'
import { useI18n } from '../contexts/I18nContext'

interface InstitutionProfile {
  official_name:    string
  country:          string
  registration:     string  // CNPJ (BR) ou número de registro (intl)
  address:          string
  iban:             string
  swift:            string
  account_number:   string
  account_open_date: string // YYYY-MM-DD
}

const EMPTY_PROFILE: InstitutionProfile = {
  official_name:    '',
  country:          '',
  registration:     '',
  address:          '',
  iban:             '',
  swift:            '',
  account_number:   '',
  account_open_date: '',
}

const BANK_DATABASE: Record<string, Partial<InstitutionProfile>> = {
  'Interactive Brokers': {
    official_name: 'Interactive Brokers Ireland Ltd',
    country:       'Irlanda',
    registration:  '',
    address:       'Two Harbourmaster Place, IFSC, Dublin 1, Irlanda',
    swift:         'IBKRUS33',
  },
  'XP': {
    official_name: 'XP Investimentos CCTVM S/A',
    country:       'Brasil',
    registration:  '02.332.886/0011-03',
    address:       'Av. Chedid Jafet, 75, Vila Olímpia, São Paulo, SP',
  },
  'BTG': {
    official_name: 'Banco BTG Pactual S.A.',
    country:       'Brasil',
    registration:  '30.306.294/0001-45',
    address:       'Av. Brigadeiro Faria Lima, 3477, Itaim Bibi, São Paulo, SP',
  },
  'C6': {
    official_name: 'Banco C6 S.A.',
    country:       'Brasil',
    registration:  '31.872.495/0001-72',
    address:       'Al. Joaquim Eugênio de Lima, 680, Jardim Paulista, São Paulo, SP',
  },
  'Nubank': {
    official_name: 'Nu Pagamentos S.A.',
    country:       'Brasil',
    registration:  '18.236.120/0001-58',
    address:       'Rua Capote Valente, 39, Pinheiros, São Paulo, SP',
  },
  'Rico': {
    official_name: 'Rico Investimentos CTVM S.A. · Grupo XP',
    country:       'Brasil',
    registration:  '02.332.886/0011-03',
    address:       'Av. Chedid Jafet, 75, Vila Olímpia, São Paulo, SP',
  },
  'Clear': {
    official_name: 'Clear Corretora CTVM S.A. · Grupo XP',
    country:       'Brasil',
    registration:  '02.332.886/0001-03',
    address:       'Av. Chedid Jafet, 75, Vila Olímpia, São Paulo, SP',
  },
  'Itaú': {
    official_name: 'Itaú Unibanco S.A.',
    country:       'Brasil',
    registration:  '60.701.190/0001-04',
    address:       'Praça Alfredo Egydio de Souza Aranha, 100, Jabaquara, São Paulo, SP',
  },
  'Bradesco': {
    official_name: 'Banco Bradesco S.A.',
    country:       'Brasil',
    registration:  '60.746.948/0001-12',
    address:       'Núcleo Cidade de Deus, s/n, Vila Yara, Osasco, SP',
  },
  'Santander': {
    official_name: 'Banco Santander (Brasil) S.A.',
    country:       'Brasil',
    registration:  '90.400.888/0001-42',
    address:       'Av. Presidente Juscelino Kubitschek, 2041, Itaim Bibi, São Paulo, SP',
  },
  'Banco do Brasil': {
    official_name: 'Banco do Brasil S.A.',
    country:       'Brasil',
    registration:  '00.000.000/0001-91',
    address:       'SBS, Quadra 1, Bloco G, Lote 32, Brasília, DF',
  },
  'Caixa': {
    official_name: 'Caixa Econômica Federal',
    country:       'Brasil',
    registration:  '00.360.305/0001-04',
    address:       'SBS, Quadra 4, Lotes 3/4, Brasília, DF',
  },
  'Banco Inter': {
    official_name: 'Banco Inter S.A.',
    country:       'Brasil',
    registration:  '00.416.968/0001-01',
    address:       'Av. José Cândido da Silveira, 2000, Horto, Belo Horizonte, MG',
  },
  'Avenue': {
    official_name: 'Avenue Securities LLC',
    country:       'EUA',
    registration:  '',
    address:       '125 E. Palmetto Park Rd., Suite 105, Boca Raton, FL 33432',
  },
  'Genial': {
    official_name: 'Genial Investimentos CCTVM S.A.',
    country:       'Brasil',
    registration:  '27.652.684/0001-62',
    address:       'Av. Brigadeiro Faria Lima, 3400, Itaim Bibi, São Paulo, SP',
  },
  // ── Corretoras / Bancos franceses ────────────────────────────────────────
  'Boursorama': {
    official_name: 'Boursorama S.A.',
    country:       'França',
    registration:  '351 058 444',
    address:       '18 quai du Président Roosevelt, 92130 Issy-les-Moulineaux, France',
  },
  'Bourse Direct': {
    official_name: 'Bourse Direct S.A.',
    country:       'França',
    registration:  '753 127 736',
    address:       '253 rue de Saint-Honoré, 75001 Paris, France',
  },
  'Crédit Agricole': {
    official_name: 'Crédit Agricole S.A.',
    country:       'França',
    registration:  '784 608 416',
    address:       '12 place des États-Unis, 92120 Montrouge, France',
  },
  'Fortuneo': {
    official_name: 'Fortuneo Banque',
    country:       'França',
    registration:  '514 076 509',
    address:       '1 place Copernic, 92098 Paris La Défense Cedex, France',
  },
  'BNP Paribas': {
    official_name: 'BNP Paribas S.A.',
    country:       'França',
    registration:  '662 042 449',
    address:       '16 boulevard des Italiens, 75009 Paris, France',
  },
  'Société Générale': {
    official_name: 'Société Générale S.A.',
    country:       'França',
    registration:  '552 120 222',
    address:       '29 boulevard Haussmann, 75009 Paris, France',
  },
  'Caisse d\'Épargne': {
    official_name: 'Caisse d\'Épargne et de Prévoyance',
    country:       'França',
    registration:  '778 282 066',
    address:       '50 avenue Pierre Mendès France, 75013 Paris, France',
  },
  'LCL': {
    official_name: 'LCL · Le Crédit Lyonnais S.A.',
    country:       'França',
    registration:  '954 509 741',
    address:       '20 avenue de Paris, 94811 Villejuif Cedex, France',
  },
  'Banque Postale': {
    official_name: 'La Banque Postale',
    country:       'França',
    registration:  '421 100 645',
    address:       '115 rue de Sèvres, 75275 Paris Cedex 06, France',
  },
  // ── Corretoras europeias ─────────────────────────────────────────────────
  '212 Trading': {
    official_name: 'Trading 212 Markets Ltd',
    country:       'Chipre',
    registration:  'HE322334',
    address:       '3 Kallipoleos Street, Limassol 3036, Chypre',
  },
  'Trade Republic': {
    official_name: 'Trade Republic Bank GmbH',
    country:       'Alemanha',
    registration:  'DE 324 929 578',
    address:       'Kastanienallee 32, 10435 Berlin, Allemagne',
  },
  'Degiro': {
    official_name: 'DEGIRO B.V.',
    country:       'Holanda',
    registration:  '59555939',
    address:       'Rembrandt Tower, Amstelplein 1, 1096 HA Amsterdam, Pays-Bas',
  },
  'Revolut': {
    official_name: 'Revolut Bank UAB',
    country:       'Lituânia',
    registration:  '304580906',
    address:       'Konstitucijos ave. 21B, Vilnius 08130, Lituanie',
  },
  'Wise': {
    official_name: 'Wise Europe SA',
    country:       'Bélgica',
    registration:  '0713.629.988',
    address:       'Square de Meeûs 35, 1000 Bruxelles, Belgique',
  },
  'Saxo Bank': {
    official_name: 'Saxo Bank A/S',
    country:       'Dinamarca',
    registration:  '15731249',
    address:       'Philip Heymans Allé 15, 2900 Hellerup, Danemark',
  },
  'Swissquote': {
    official_name: 'Swissquote Bank Ltd',
    country:       'Suíça',
    registration:  'CHE-113.540.212',
    address:       'Chemin de la Crêtaux 33, 1196 Gland, Suisse',
    swift:         'SWQBCHZZXXX',
  },
  // ── Bancos portugueses ───────────────────────────────────────────────────
  'Millennium BCP': {
    official_name: 'Banco Comercial Português, S.A.',
    country:       'Portugal',
    registration:  '501 525 882',
    address:       'Praça D. João I, 28, 4000-295 Porto, Portugal',
  },
  'Banco BPI': {
    official_name: 'Banco BPI, S.A.',
    country:       'Portugal',
    registration:  '501 214 534',
    address:       'Rua Tenente Valadim, 284, 4100-476 Porto, Portugal',
  },
  'Caixa Geral de Depósitos': {
    official_name: 'Caixa Geral de Depósitos, S.A.',
    country:       'Portugal',
    registration:  '500 960 046',
    address:       'Av. João XXI, 63, 1000-300 Lisboa, Portugal',
  },
  'Banco Montepio': {
    official_name: 'Banco Montepio Geral, S.A.',
    country:       'Portugal',
    registration:  '500 702 409',
    address:       'Rua Áurea, 219-241, 1100-060 Lisboa, Portugal',
  },
  'ActivoBank': {
    official_name: 'ActivoBank, S.A.',
    country:       'Portugal',
    registration:  '501 680 729',
    address:       'Rua Augusta, 84, 1100-053 Lisboa, Portugal',
  },
}

function findInBankDatabase(name: string): Partial<InstitutionProfile> | undefined {
  if (!name) return undefined
  // 1. Exact match
  if (BANK_DATABASE[name]) return BANK_DATABASE[name]
  // 2. Case-insensitive exact match
  const lower = name.toLowerCase()
  const exactCI = Object.keys(BANK_DATABASE).find(k => k.toLowerCase() === lower)
  if (exactCI) return BANK_DATABASE[exactCI]
  // 3. Any DB key (≥2 chars) appears as word/substring in the exchange name
  const partial = Object.keys(BANK_DATABASE)
    .filter(k => k.length >= 2)
    .find(k => lower.includes(k.toLowerCase()))
  if (partial) return BANK_DATABASE[partial]
  return undefined
}

const COUNTRY_OPTIONS = [
  { value: '',            label: 'Selecione...' },
  { value: 'Brasil',      label: 'Brasil' },
  { value: 'França',      label: 'França' },
  { value: 'EUA',         label: 'EUA' },
  { value: 'Reino Unido', label: 'Reino Unido' },
  { value: 'Alemanha',    label: 'Alemanha' },
  { value: 'Portugal',    label: 'Portugal' },
  { value: 'Suíça',       label: 'Suíça' },
  { value: 'Irlanda',     label: 'Irlanda' },
  { value: 'Holanda',     label: 'Holanda' },
  { value: 'Bélgica',     label: 'Bélgica' },
  { value: 'Lituânia',    label: 'Lituânia' },
  { value: 'Chipre',      label: 'Chipre' },
  { value: 'Dinamarca',   label: 'Dinamarca' },
  { value: 'Bulgária',    label: 'Bulgária' },
  { value: 'Luxemburgo',  label: 'Luxemburgo' },
  { value: 'Outro',       label: 'Outro' },
]

interface ProfileData {
  institution_data: Record<string, InstitutionProfile>
}

export default function InstitutionsPage() {
  const location = useLocation()
  const { t } = useI18n()
  const focusName = (location.state as { focus?: string } | null)?.focus ?? null

  const { data: portfolio } = usePortfolioValue()
  const [institutionData, setInstitutionData] = useState<Record<string, InstitutionProfile>>({})
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded]     = useState<string | null>(focusName)
  const [form, setForm]             = useState<InstitutionProfile>(EMPTY_PROFILE)
  const [saving, setSaving]         = useState(false)
  const [saveOk, setSaveOk]         = useState<string | null>(null)
  const [autoFilledFor, setAutoFilledFor] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<ProfileData>('/profile')
      .then(d => setInstitutionData(d.institution_data ?? {}))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Quando abre uma instituição, carrega o form com os dados salvos ou da base de dados
  const openInstitution = useCallback((name: string) => {
    setExpanded(prev => {
      if (prev === name) { setAutoFilledFor(null); return null }
      const saved = institutionData[name]
      if (saved?.official_name) {
        setForm({ ...EMPTY_PROFILE, ...saved })
        setAutoFilledFor(null)
      } else {
        const dbEntry = findInBankDatabase(name)
        if (dbEntry) {
          setForm({ ...EMPTY_PROFILE, ...dbEntry })
          setAutoFilledFor(name)
        } else {
          setForm({ ...EMPTY_PROFILE })
          setAutoFilledFor(null)
        }
      }
      return name
    })
  }, [institutionData])

  // Auto-open if navigated with state.focus
  useEffect(() => {
    if (focusName && !loading) openInstitution(focusName)
  }, [focusName, loading, openInstitution])

  async function handleSave(institutionName: string) {
    setSaving(true)
    const updated = { ...institutionData, [institutionName]: { ...form } }
    try {
      await apiFetch('/profile', {
        method: 'PATCH',
        body: JSON.stringify({ institution_data: updated }),
      })
      setInstitutionData(updated)
      setSaveOk(institutionName)
      setAutoFilledFor(null)
      setTimeout(() => setSaveOk(null), 3000)
    } catch { /* ignore */ } finally {
      setSaving(false)
    }
  }

  // Lista de instituições únicas usadas nos ativos — agrupa ignorando
  // maiúsculas/minúsculas para não duplicar "Interactive Brokers" e
  // "INTERACTIVE BROKERS" como instituições diferentes.
  const usedInstByKey = new Map<string, string>()
  for (const raw of (portfolio?.by_asset ?? []).map(a => a.exchange?.trim()).filter((e): e is string => !!e)) {
    const key = raw.toLowerCase()
    if (!usedInstByKey.has(key)) usedInstByKey.set(key, raw)
  }
  const usedInstitutions = [...usedInstByKey.values()].sort()

  // Instituições com dados salvos mas não mais em uso
  const savedOnly = Object.keys(institutionData).filter(k => !usedInstitutions.includes(k)).sort()
  const allInstitutions = [...usedInstitutions, ...savedOnly.filter(k => !usedInstitutions.includes(k))]

  function Field({ label, field, placeholder, textarea }: {
    label: string; field: keyof InstitutionProfile; placeholder?: string; textarea?: boolean
  }) {
    const inputClass = "w-full border border-[var(--arvo-border)] rounded-[3px] px-3 py-2 text-sm bg-[var(--arvo-surface)] text-[var(--arvo-fg)] focus:outline-none focus:border-[var(--arvo-gold)] focus:ring-2 focus:ring-[var(--arvo-gold)]/25"
    return (
      <div>
        <label className="block text-xs text-[var(--arvo-fg-muted)] mb-1">{label}</label>
        {textarea ? (
          <textarea
            value={form[field]}
            onChange={e => setForm(prev => ({ ...prev, [field]: e.target.value }))}
            placeholder={placeholder}
            rows={2}
            className={inputClass + ' resize-none'}
          />
        ) : (
          <input
            type="text"
            value={form[field]}
            onChange={e => setForm(prev => ({ ...prev, [field]: e.target.value }))}
            placeholder={placeholder}
            className={inputClass}
          />
        )}
      </div>
    )
  }

  if (loading) {
    return <PageLoader />
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--arvo-fg)]">{t.institutions.title}</h1>
        <p className="text-sm text-[var(--arvo-fg-soft)] mt-1">
          {t.institutions.subtitle}
        </p>
      </div>

      {allInstitutions.length === 0 ? (
        <div className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl p-12 text-center text-[var(--arvo-fg-soft)] shadow-sm">
          {t.institutions.noFound}
        </div>
      ) : (
        <div className="space-y-3">
          {allInstitutions.map(name => {
            const isOpen    = expanded === name
            const hasData   = !!institutionData[name]?.official_name
            const isActive  = usedInstitutions.includes(name)

            return (
              <div key={name} className="bg-[var(--arvo-surface)] border border-[var(--arvo-border)] rounded-2xl overflow-hidden shadow-sm">
                <button
                  onClick={() => openInstitution(name)}
                  className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-[var(--arvo-surface-2)] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <InstitutionLogo name={name} size={32} />
                    <div>
                      <span className="font-semibold text-[var(--arvo-fg)]">{name}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        {!isActive && (
                          <span className="text-xs text-[var(--arvo-fg-soft)] border border-[var(--arvo-border)] rounded px-1.5 py-0.5">{t.institutions.noAssets}</span>
                        )}
                        {hasData ? (
                          <span className="text-xs text-green-600 font-medium dark:text-green-300">✓ {t.institutions.dataFilled}</span>
                        ) : findInBankDatabase(name) ? (
                          <span className="text-xs text-amber-600 font-medium dark:text-amber-300">{t.institutions.arvoBase}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <span className="text-[var(--arvo-fg-soft)] text-sm">{isOpen ? '▲' : '▼'}</span>
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 border-t border-[var(--arvo-border-soft)] space-y-4 pt-4">
                    {autoFilledFor === name && (
                      <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl dark:bg-amber-950/40 dark:border-amber-900">
                        <span className="text-amber-500 shrink-0 dark:text-amber-400">⚠</span>
                        <p className="text-xs text-amber-800 dark:text-amber-200">
                          {t.institutions.arvoWarning}
                        </p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <Field label="Nome oficial" field="official_name" placeholder="Ex: XP Investimentos CCTVM S.A." />
                      </div>
                      <div>
                        <label className="block text-xs text-[var(--arvo-fg-muted)] mb-1">País</label>
                        <select
                          value={form.country}
                          onChange={e => setForm(prev => ({ ...prev, country: e.target.value }))}
                          className="w-full border border-[var(--arvo-border)] rounded-[3px] px-3 py-2 text-sm bg-[var(--arvo-surface)] focus:outline-none focus:border-[var(--arvo-gold)] focus:ring-2 focus:ring-[var(--arvo-gold)]/25"
                        >
                          {COUNTRY_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                      <Field
                        label={form.country === 'Brasil' ? 'CNPJ' : 'Número de registro'}
                        field="registration"
                        placeholder={form.country === 'Brasil' ? '00.000.000/0001-00' : 'Nº de registro'}
                      />
                      <div className="col-span-2">
                        <Field label="Endereço" field="address" placeholder="Rua, cidade, país..." textarea />
                      </div>
                      <Field label="IBAN" field="iban" placeholder="Ex: FR76 3000 6000 0112..." />
                      <Field label="SWIFT / BIC" field="swift" placeholder="Ex: CMCIFRPP" />
                      <div className="col-span-2">
                        <Field label="Número da conta" field="account_number" placeholder="Nº da sua conta nesta instituição" />
                      </div>
                      <div>
                        <label className="block text-xs text-[var(--arvo-fg-muted)] mb-1">Data de abertura da conta</label>
                        <DatePicker
                          value={form.account_open_date}
                          onChange={iso => setForm(prev => ({ ...prev, account_open_date: iso }))}
                          max={new Date().toISOString().slice(0, 10)}
                          style={{ borderRadius: 3, padding: '8px 12px', fontSize: 14 }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                      <button
                        onClick={() => handleSave(name)}
                        disabled={saving}
                        className="px-4 py-2 bg-[var(--arvo-fg)] text-[var(--arvo-pill-active-fg)] rounded-xl text-sm font-semibold hover:bg-[var(--arvo-fg)]/90 disabled:opacity-50 transition-colors"
                      >
                        {saving ? t.common.loading : t.common.save}
                      </button>
                      {saveOk === name && (
                        <span className="text-xs text-green-600 dark:text-green-300">{t.profile.saved}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
