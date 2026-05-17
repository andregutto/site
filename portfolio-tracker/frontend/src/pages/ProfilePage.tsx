import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useCurrency, type Currency } from '../contexts/CurrencyContext'
import { useAchievementContext } from '../contexts/AchievementContext'
import { useI18n } from '../contexts/I18nContext'
import { getLevel, getNextLevel, getLevelProgress, ACHIEVEMENT_DEFS } from '../lib/achievementDefs'
import { supabase } from '../lib/supabase'
import { useResetPriceHistory } from '../hooks/usePortfolio'

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
  const { totalXp, earnedKeys, triggerCheck } = useAchievementContext()
  const { t } = useI18n()
  const level = getLevel(totalXp)
  const nextLevel = getNextLevel(totalXp)
  const levelProgress = getLevelProgress(totalXp)
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

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirm,   setDeleteConfirm]   = useState('')
  const [deleting,        setDeleting]        = useState(false)
  const [deleteError,     setDeleteError]     = useState<string | null>(null)

  const { reset: rebuildHistory, loading: rebuilding, result: rebuildResult } = useResetPriceHistory()
  const [showRebuildConfirm, setShowRebuildConfirm] = useState(false)

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
      triggerCheck()
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

  async function handleDeleteAccount() {
    setDeleting(true); setDeleteError(null)
    try {
      await apiFetch('/profile', { method: 'DELETE' })
      await supabase.auth.signOut()
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Erro ao excluir conta')
      setDeleting(false)
    }
  }

  const emailForDisplay = email || user?.email || ''
  const avatarInitials  = initials(firstName, lastName, emailForDisplay)
  const displayName     = [firstName, lastName].filter(Boolean).join(' ') || 'Sem nome'

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-xl font-bold text-gray-900">{t.profile.title}</h1>

      {loading ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center text-gray-400 text-sm">
          {t.common.loading}
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
                {avatarUrl ? t.profile.changePhoto : t.profile.addPhoto}
              </button>
            </div>
          </div>

          {/* XP / Level card */}
          <Link
            to="/achievements"
            className="block bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group"
          >
            {/* accent bar */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#001A70] to-[#C9A227] rounded-l-2xl" />

            <div className="flex items-center justify-between mb-4 pl-3">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{level.emoji}</span>
                <div>
                  <p className="text-[10px] text-[#001A70] font-bold uppercase tracking-widest">{t.achievements.currentLevel}</p>
                  <p className="text-gray-900 font-bold text-base leading-tight">{level.name}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-gray-900 font-bold text-xl">
                  {totalXp} <span className="text-[#C9A227]">{t.achievements.xp}</span>
                </p>
                <p className="text-gray-400 text-xs">{earnedKeys.length}/{ACHIEVEMENT_DEFS.length} {t.achievements.subtitle}</p>
              </div>
            </div>

            <div className="pl-3">
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#001A70] to-[#C9A227] transition-all duration-700"
                  style={{ width: `${levelProgress}%` }}
                />
              </div>
              {nextLevel && (
                <p className="text-gray-400 text-xs mt-1.5">
                  {t.achievements.nextLevel}: {nextLevel.emoji} {nextLevel.name} · {nextLevel.minXp} {t.achievements.xp}
                </p>
              )}
            </div>

            <svg className="absolute right-4 top-4 w-3.5 h-3.5 text-gray-300 group-hover:text-[#001A70] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>

          {/* Dados pessoais */}
          <form onSubmit={handleSave} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="font-semibold text-gray-800">{t.profile.personalData}</h2>

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

          {/* Zona de perigo */}
          <div className="bg-white border border-red-100 rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="font-semibold text-red-700">Zona de perigo</h2>

            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-700">Reconstruir todo o histórico</p>
              <p className="text-xs text-gray-500">Apaga o histórico de cotações e sincroniza todos os ativos do zero. Necessário após importações da B3. O processo roda em segundo plano (5-10 min).</p>
              {!showRebuildConfirm ? (
                <button
                  type="button"
                  disabled={rebuilding}
                  onClick={() => setShowRebuildConfirm(true)}
                  className="px-4 py-2 text-sm font-semibold text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-50 disabled:opacity-50 transition-colors"
                >
                  {rebuilding ? 'Processando...' : 'Reconstruir Todo o Histórico'}
                </button>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-amber-700 font-medium">Isso apaga e rebusca todo o histórico. Confirma?</span>
                  <button
                    type="button"
                    onClick={() => { rebuildHistory(); setShowRebuildConfirm(false) }}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors"
                  >
                    Confirmar
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRebuildConfirm(false)}
                    className="px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              )}
              {rebuildResult && !rebuilding && (
                <p className="text-xs text-blue-600">
                  Sincronização iniciada — {rebuildResult.total} ativos sendo processados em segundo plano.
                </p>
              )}
            </div>

            <div className="border-t border-red-100 pt-4 space-y-2">
              <p className="text-xs text-gray-500">A exclusao e permanente e remove todos os seus dados: ativos, aportes, historico de precos e configuracoes. Esta acao nao pode ser desfeita.</p>
              <button
                type="button"
                onClick={() => { setShowDeleteModal(true); setDeleteConfirm(''); setDeleteError(null) }}
                className="px-4 py-2 text-sm font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
              >
                Excluir minha conta
              </button>
            </div>
          </div>

          {/* Modal de confirmacao de exclusao */}
          {showDeleteModal && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
                <h3 className="text-lg font-bold text-gray-900">Confirmar exclusao</h3>
                <p className="text-sm text-gray-500">
                  Esta acao excluira permanentemente sua conta e todos os dados associados. Para confirmar, digite seu e-mail abaixo:
                </p>
                <p className="text-xs font-mono bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700 select-all">{emailForDisplay}</p>
                <input
                  type="email"
                  value={deleteConfirm}
                  onChange={e => setDeleteConfirm(e.target.value)}
                  placeholder="Digite seu e-mail"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  autoFocus
                />
                {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(false)}
                    disabled={deleting}
                    className="flex-1 py-2.5 text-sm font-semibold border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteAccount}
                    disabled={deleting || deleteConfirm.trim().toLowerCase() !== emailForDisplay.toLowerCase()}
                    className="flex-1 py-2.5 text-sm font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-40 transition-colors"
                  >
                    {deleting ? 'Excluindo...' : 'Excluir conta'}
                  </button>
                </div>
              </div>
            </div>
          )}

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
