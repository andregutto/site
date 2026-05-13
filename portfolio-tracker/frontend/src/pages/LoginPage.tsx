import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useI18n } from '../contexts/I18nContext'
import LoginFooter from '../components/LoginFooter'
import LanguageSelector from '../components/LanguageSelector'

type Mode = 'login' | 'register' | 'forgot'
type Currency = 'BRL' | 'USD' | 'EUR'

const COUNTRY_OPTIONS = [
  { value: '',            label: '—' },
  { value: 'Brasil',      label: 'Brasil' },
  { value: 'França',      label: 'France' },
  { value: 'Portugal',    label: 'Portugal' },
  { value: 'Alemanha',    label: 'Deutschland' },
  { value: 'Espanha',     label: 'España' },
  { value: 'Reino Unido', label: 'United Kingdom' },
  { value: 'Suíça',       label: 'Suisse / Schweiz' },
  { value: 'EUA',         label: 'United States' },
  { value: 'Canadá',      label: 'Canada' },
  { value: 'Austrália',   label: 'Australia' },
  { value: 'Outro',       label: 'Outro / Other' },
]

export default function LoginPage() {
  const { signIn, signUp } = useAuth()
  const { t } = useI18n()
  const l = t.login

  const [mode, setMode]         = useState<Mode>('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const [error, setError]       = useState('')
  const [info, setInfo]         = useState('')
  const [loading, setLoading]   = useState(false)

  // Register-only fields
  const [firstName,  setFirstName]  = useState('')
  const [lastName,   setLastName]   = useState('')
  const [country,    setCountry]    = useState('')
  const [taxCountry, setTaxCountry] = useState('')
  const [birthdate,  setBirthdate]  = useState('')
  const [currency,   setCurrency]   = useState<Currency>('BRL')

  function resetExtras() {
    setFirstName(''); setLastName(''); setCountry('')
    setTaxCountry(''); setBirthdate(''); setCurrency('BRL')
  }

  function switchMode(m: Mode) {
    setMode(m); setError(''); setInfo('')
    if (m !== 'register') resetExtras()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setInfo('')
    setLoading(true)
    try {
      if (mode === 'login') {
        await signIn(email, password)
      } else if (mode === 'register') {
        const metadata: Record<string, unknown> = {
          first_name:       firstName || undefined,
          last_name:        lastName  || undefined,
          country:          country   || undefined,
          tax_country:      taxCountry || undefined,
          birthdate:        birthdate  || undefined,
          default_currency: currency,
        }
        Object.keys(metadata).forEach(k => metadata[k] === undefined && delete metadata[k])
        await signUp(email, password, Object.keys(metadata).length ? metadata : undefined)
        setInfo(l.confirmEmail)
        // store currency preference immediately
        localStorage.setItem('preferredCurrency', currency)
        // subscribe to newsletter (fire and forget)
        fetch('/api/newsletter/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, first_name: firstName || undefined, last_name: lastName || undefined, country: country || undefined }),
        }).catch(() => {})
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (err) throw err
        setInfo(l.emailSent)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  const submitLabel = loading
    ? l.loading
    : mode === 'login' ? l.submit
    : mode === 'register' ? l.submitRegister
    : l.submitForgot

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">

        {/* Header bar: André Gutto left, language selector right */}
        <div className="flex items-center justify-between mb-8">
          <a
            href="https://andregutto.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:opacity-70 transition-opacity tracking-[-0.2px]"
            style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 16, color: '#1B2F4E', textDecoration: 'none' }}
          >
            André Gutto
          </a>
          <LanguageSelector />
        </div>

        <div className="space-y-5">

        {/* Branding */}
        <div className="text-center space-y-1">
          <div className="flex justify-center pb-1">
            <img src="/favicon.svg" alt="Logo" className="w-10 h-10" />
          </div>
          <h1
            className="text-[28px] font-bold text-[#001A70] leading-tight"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Portfolio Tracker
          </h1>
          <p className="text-gray-500 text-sm">{l.subtitle}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-7 space-y-5">

          {/* Mode tabs */}
          {mode !== 'forgot' && (
            <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
              {(['login', 'register'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                    mode === m ? 'bg-white shadow-sm text-[#001A70]' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {m === 'login' ? l.loginTab : l.registerTab}
                </button>
              ))}
            </div>
          )}

          {mode === 'forgot' && (
            <div>
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-xs text-[#001A70] hover:underline flex items-center gap-1"
              >
                {l.backToLogin}
              </button>
              <p className="text-sm text-gray-500 mt-2">{l.forgotDesc}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Register-only: nome + sobrenome */}
            {mode === 'register' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{l.firstName}</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="André"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20 focus:border-[#001A70]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{l.lastName}</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Gutto"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20 focus:border-[#001A70]"
                  />
                </div>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{l.email}</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20 focus:border-[#001A70]"
                placeholder="seu@email.com"
              />
            </div>

            {/* Password */}
            {mode !== 'forgot' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{l.password}</label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20 focus:border-[#001A70]"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                    tabIndex={-1}
                  >
                    {showPwd ? l.hidePwd : l.showPwd}
                  </button>
                </div>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-xs text-gray-400 hover:text-[#001A70] mt-1 block"
                  >
                    {l.forgotPwd}
                  </button>
                )}
              </div>
            )}

            {/* Register-only: país + residência fiscal */}
            {mode === 'register' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{t.profile.country}</label>
                    <select
                      value={country}
                      onChange={e => setCountry(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
                    >
                      {COUNTRY_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{l.taxCountry}</label>
                    <select
                      value={taxCountry}
                      onChange={e => setTaxCountry(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
                    >
                      {COUNTRY_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">{l.birthdate}</label>
                  <input
                    type="date"
                    value={birthdate}
                    onChange={e => setBirthdate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">{l.defaultCurrency}</label>
                  <div className="flex gap-2">
                    {(['BRL', 'USD', 'EUR'] as Currency[]).map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCurrency(c)}
                        className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${
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
              </>
            )}

            {error && (
              <p className="text-sm px-3 py-2 rounded-lg bg-red-50 text-red-700">{error}</p>
            )}
            {info && (
              <p className="text-sm px-3 py-2 rounded-lg bg-blue-50 text-blue-700">{info}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#001A70] text-white py-2.5 rounded-lg font-medium text-sm hover:bg-[#002494] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {submitLabel}
            </button>
          </form>
        </div>

        </div>{/* end space-y-5 */}

        <div className="mt-6">
          <LoginFooter />
        </div>
      </div>
    </div>
  )
}
