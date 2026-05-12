import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useCurrency, type Currency } from '../contexts/CurrencyContext'

interface ProfileData {
  email:                string
  first_name:           string
  last_name:            string
  country:              string
  portfolio_start_date: string
  allocation_targets:   Record<string, number>
}

const COUNTRY_OPTIONS = [
  { value: '',            label: 'Selecione o país' },
  { value: 'Brasil',      label: 'Brasil' },
  { value: 'França',      label: 'França' },
  { value: 'Portugal',    label: 'Portugal' },
  { value: 'Alemanha',    label: 'Alemanha' },
  { value: 'Espanha',     label: 'Espanha' },
  { value: 'Reino Unido', label: 'Reino Unido' },
  { value: 'Suíça',       label: 'Suíça' },
  { value: 'EUA',         label: 'EUA' },
  { value: 'Canadá',      label: 'Canadá' },
  { value: 'Austrália',   label: 'Austrália' },
  { value: 'Outro',       label: 'Outro' },
]

const CURRENCIES: Currency[] = ['BRL', 'USD', 'EUR']

function initials(firstName: string, lastName: string, email: string) {
  if (firstName.trim()) {
    const parts = [firstName.trim()[0], lastName.trim()[0]].filter(Boolean)
    return parts.join('').toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

export default function ProfilePage() {
  const { user } = useAuth()
  const { currency, setCurrency } = useCurrency()

  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [saveOk,   setSaveOk]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const [firstName,  setFirstName]  = useState('')
  const [lastName,   setLastName]   = useState('')
  const [country,    setCountry]    = useState('')
  const [startDate,  setStartDate]  = useState('')
  const [email,      setEmail]      = useState('')

  const [newPassword,    setNewPassword]    = useState('')
  const [confirmPwd,     setConfirmPwd]     = useState('')
  const [savingPwd,      setSavingPwd]      = useState(false)
  const [pwdOk,          setPwdOk]          = useState(false)
  const [pwdError,       setPwdError]       = useState<string | null>(null)

  useEffect(() => {
    apiFetch<ProfileData>('/profile')
      .then(d => {
        setEmail(d.email)
        setFirstName(d.first_name)
        setLastName(d.last_name)
        setCountry(d.country)
        setStartDate(d.portfolio_start_date)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Erro ao carregar perfil'))
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null); setSaveOk(false)
    try {
      await apiFetch('/profile', {
        method: 'PATCH',
        body: JSON.stringify({ first_name: firstName, last_name: lastName, country, portfolio_start_date: startDate }),
      })
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPwd) { setPwdError('As senhas não coincidem'); return }
    if (newPassword.length < 6)     { setPwdError('Mínimo 6 caracteres'); return }
    setSavingPwd(true); setPwdError(null); setPwdOk(false)
    try {
      await apiFetch('/profile/password', {
        method: 'PATCH',
        body: JSON.stringify({ password: newPassword }),
      })
      setPwdOk(true)
      setNewPassword(''); setConfirmPwd('')
      setTimeout(() => setPwdOk(false), 3000)
    } catch (e) {
      setPwdError(e instanceof Error ? e.message : 'Erro ao alterar senha')
    } finally {
      setSavingPwd(false)
    }
  }

  const emailForDisplay = email || user?.email || ''
  const avatarInitials  = initials(firstName, lastName, emailForDisplay)
  const displayName     = [firstName, lastName].filter(Boolean).join(' ') || 'Sem nome'

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Perfil</h1>

      {loading ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center text-gray-400 text-sm">
          Carregando...
        </div>
      ) : (
        <>
          {/* Avatar + nome */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6 flex items-center gap-5 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-[#001A70] text-white flex items-center justify-center text-xl font-bold shrink-0">
              {avatarInitials}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 truncate">{displayName}</p>
              <p className="text-sm text-gray-500 truncate">{emailForDisplay}</p>
            </div>
          </div>

          {/* Dados pessoais */}
          <form onSubmit={handleSave} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="font-semibold text-gray-800">Dados pessoais</h2>

            <div>
              <label className="block text-xs text-gray-500 mb-1">E-mail (somente leitura)</label>
              <input
                type="email"
                value={emailForDisplay}
                readOnly
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nome</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="André"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Sobrenome</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Gutto"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">País de residência</label>
              <select
                value={country}
                onChange={e => setCountry(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
              >
                {COUNTRY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Início do portfólio</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Moeda padrão</label>
              <div className="flex gap-2">
                {CURRENCIES.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    className={`flex-1 py-2 text-sm font-semibold rounded-lg border transition-colors ${
                      currency === c
                        ? 'bg-[#001A70] text-white border-[#001A70]'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {error    && <p className="text-xs text-red-600">{error}</p>}
            {saveOk   && <p className="text-xs text-green-600">Salvo com sucesso.</p>}

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-[#001A70] text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-[#001A70]/90 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </form>

          {/* Alterar senha */}
          <form onSubmit={handleChangePassword} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="font-semibold text-gray-800">Alterar senha</h2>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Nova senha</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Confirmar senha</label>
              <input
                type="password"
                value={confirmPwd}
                onChange={e => setConfirmPwd(e.target.value)}
                placeholder="Repita a nova senha"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
              />
            </div>

            {pwdError && <p className="text-xs text-red-600">{pwdError}</p>}
            {pwdOk    && <p className="text-xs text-green-600">Senha alterada com sucesso.</p>}

            <button
              type="submit"
              disabled={savingPwd}
              className="w-full border border-[#001A70] text-[#001A70] rounded-xl py-2.5 text-sm font-semibold hover:bg-[#001A70]/5 disabled:opacity-50 transition-colors"
            >
              {savingPwd ? 'Alterando...' : 'Alterar senha'}
            </button>
          </form>
        </>
      )}
    </div>
  )
}
