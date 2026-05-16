import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { usePortfolioValue } from '../hooks/usePortfolio'
import InstitutionLogo from '../components/InstitutionLogo'

interface InstitutionProfile {
  official_name:  string
  country:        string
  registration:   string  // CNPJ (BR) ou número de registro (intl)
  address:        string
  iban:           string
  swift:          string
  account_number: string
}

const EMPTY_PROFILE: InstitutionProfile = {
  official_name:  '',
  country:        '',
  registration:   '',
  address:        '',
  iban:           '',
  swift:          '',
  account_number: '',
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
  { value: 'Outro',       label: 'Outro' },
]

interface ProfileData {
  institution_data: Record<string, InstitutionProfile>
}

export default function InstitutionsPage() {
  const location = useLocation()
  const focusName = (location.state as { focus?: string } | null)?.focus ?? null

  const { data: portfolio } = usePortfolioValue()
  const [institutionData, setInstitutionData] = useState<Record<string, InstitutionProfile>>({})
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState<string | null>(focusName)
  const [form, setForm]         = useState<InstitutionProfile>(EMPTY_PROFILE)
  const [saving, setSaving]     = useState(false)
  const [saveOk, setSaveOk]     = useState<string | null>(null)

  useEffect(() => {
    apiFetch<ProfileData>('/profile')
      .then(d => setInstitutionData(d.institution_data ?? {}))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Quando abre uma instituição, carrega o form com os dados salvos
  const openInstitution = useCallback((name: string) => {
    setExpanded(prev => {
      if (prev === name) return null
      setForm(institutionData[name] ?? { ...EMPTY_PROFILE })
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
      setTimeout(() => setSaveOk(null), 3000)
    } catch { /* ignore */ } finally {
      setSaving(false)
    }
  }

  // Lista de instituições únicas usadas nos ativos
  const usedInstitutions = [...new Set(
    (portfolio?.by_asset ?? [])
      .map(a => a.exchange?.trim())
      .filter((e): e is string => !!e)
  )].sort()

  // Instituições com dados salvos mas não mais em uso
  const savedOnly = Object.keys(institutionData).filter(k => !usedInstitutions.includes(k)).sort()
  const allInstitutions = [...usedInstitutions, ...savedOnly.filter(k => !usedInstitutions.includes(k))]

  function Field({ label, field, placeholder, textarea }: {
    label: string; field: keyof InstitutionProfile; placeholder?: string; textarea?: boolean
  }) {
    const inputClass = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
    return (
      <div>
        <label className="block text-xs text-gray-500 mb-1">{label}</label>
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
    return <div className="text-center text-gray-400 text-sm py-12 animate-pulse">Carregando...</div>
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Cadastro de Instituições</h1>
        <p className="text-sm text-gray-400 mt-1">
          Dados usados no relatório de imposto de renda. Clique numa instituição para editar.
        </p>
      </div>

      {allInstitutions.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center text-gray-400 shadow-sm">
          Nenhuma instituição encontrada. Atribua instituições aos ativos primeiro.
        </div>
      ) : (
        <div className="space-y-3">
          {allInstitutions.map(name => {
            const isOpen    = expanded === name
            const hasData   = !!institutionData[name]?.official_name
            const isActive  = usedInstitutions.includes(name)

            return (
              <div key={name} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                <button
                  onClick={() => openInstitution(name)}
                  className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <InstitutionLogo name={name} size={32} />
                    <div>
                      <span className="font-semibold text-gray-800">{name}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        {!isActive && (
                          <span className="text-xs text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">sem ativos</span>
                        )}
                        {hasData && (
                          <span className="text-xs text-green-600 font-medium">✓ dados preenchidos</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="text-gray-400 text-sm">{isOpen ? '▲' : '▼'}</span>
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 border-t border-gray-50 space-y-4 pt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <Field label="Nome oficial" field="official_name" placeholder="Ex: XP Investimentos CCTVM S.A." />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">País</label>
                        <select
                          value={form.country}
                          onChange={e => setForm(prev => ({ ...prev, country: e.target.value }))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
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
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                      <button
                        onClick={() => handleSave(name)}
                        disabled={saving}
                        className="px-4 py-2 bg-[#001A70] text-white rounded-xl text-sm font-semibold hover:bg-[#001A70]/90 disabled:opacity-50 transition-colors"
                      >
                        {saving ? 'Salvando...' : 'Salvar'}
                      </button>
                      {saveOk === name && (
                        <span className="text-xs text-green-600">Salvo com sucesso.</span>
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
