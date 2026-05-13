import { useState, useEffect, useRef } from 'react'
import { apiFetch } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useCurrency, type Currency } from '../contexts/CurrencyContext'
import LanguageSelector from '../components/LanguageSelector'

interface ProfileData {
  email:                string
  first_name:           string
  last_name:            string
  country:              string
  portfolio_start_date: string
  allocation_targets:   Record<string, number>
  avatar_url:           string
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

function resizeImageToDataUrl(file: File, size = 128): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = size; canvas.height = size
        const ctx = canvas.getContext('2d')!
        const scale = Math.max(size / img.width, size / img.height)
        const w = img.width * scale, h = img.height * scale
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.onerror = reject
      img.src = e.target?.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function ProfilePage() {
  const { user } = useAuth()
  const { currency, setCurrency } = useCurrency()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [saveOk,   setSaveOk]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const [firstName,  setFirstName]  = useState('')
  const [lastName,   setLastName]   = useState('')
  const [country,    setCountry]    = useState('')
  const [startDate,  setStartDate]  = useState('')
  const [email,      setEmail]      = useState('')
  const [avatarUrl,  setAvatarUrl]  = useState('')

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
        setAvatarUrl(d.avatar_url)
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Erro ao carregar perfil'))
      .finally(() => setLoading(false))
  }, [])

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await resizeImageToDataUrl(file)
      setAvatarUrl(dataUrl)
    } catch { setError('Erro ao processar imagem') }
  }

  async function handleSave(ev: React.FormEvent) {
    ev.preventDefault()
    setSaving(true); setError(null); setSaveOk(false)
    try {
      await apiFetch('/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          first_name: firstName, last_name: lastName,
          country, portfolio_start_date: startDate,
          avatar_url: avatarUrl || undefined,
        }),
      })
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  async function handleChangePassword(ev: React.FormEvent) {
    ev.preventDefault()
    if (newPassword !== confirmPwd) { setPwdError('As senhas nao coincidem'); return }
    if (newPassword.length < 6)     { setPwdError('Minimo 6 caracteres'); return }
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
    } finally { setSavingPwd(false) }
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
            <div className="relative shrink-0 group">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Foto de perfil"
                  className="w-16 h-16 rounded-full object-cover"
                  title={`${displayName} · ${emailForDisplay}`}
                />
              ) : (
                <div
                  className="w-16 h-16 rounded-full bg-[#001A70] text-white flex items-center justify-center text-xl font-bold"
                  title={`${displayName} · ${emailForDisplay}`}
                >
                  {avatarInitials}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center"
                title="Alterar foto"
              >
                <span className="text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">Alterar</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoChange}
              />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 truncate">{displayName}</p>
              <p className="text-sm text-gray-500 truncate">{emailForDisplay}</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-[#001A70] hover:underline mt-0.5"
              >
                {avatarUrl ? 'Trocar foto' : 'Adicionar foto'}
              </button>
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
              <label className="block text-xs text-gray-500 mb-1">Pais de residencia</label>
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
              <label className="block text-xs text-gray-500 mb-1">Inicio do portfolio</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Moeda padrao de visualizacao</label>
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

            <div>
              <label className="block text-xs text-gray-500 mb-2">Idioma / Language</label>
              <LanguageSelector />
            </div>

            {error    && <p className="text-xs text-red-600">{error}</p>}
            {saveOk   && <p className="text-xs text-green-600">Salvo com sucesso.</p>}

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-[#001A70] text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-[#001A70]/90 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Salvando...' : 'Salvar alteracoes'}
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
                placeholder="Minimo 6 caracteres"
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

          {/* Termos */}
          <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5 text-xs text-gray-400 space-y-1">
            <p className="font-semibold text-gray-500">Termos de uso</p>
            <p>Este sistema de rastreamento de portfolio e de uso estritamente pessoal e privado. Os dados sao armazenados de forma segura e nao sao compartilhados com terceiros.</p>
            <p>As informacoes financeiras exibidas sao calculadas a partir dos dados que voce fornece e de fontes publicas (Banco Central do Brasil, brapi.dev, Yahoo Finance, CoinGecko). Nao constituem aconselhamento financeiro.</p>
            <p className="text-gray-300 pt-1">portfolio.andregutto.com · v1.0</p>
          </div>
        </>
      )}
    </div>
  )
}
