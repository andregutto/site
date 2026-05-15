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

const INPUT_CLASS =
  'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20 focus:border-[#001A70] transition-colors bg-white'

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
        localStorage.setItem('preferredCurrency', currency)
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
      const msg = err instanceof Error ? err.message : ''
      if (/email not confirmed/i.test(msg))            setError(l.errEmailNotConfirmed)
      else if (/invalid login credentials/i.test(msg)) setError(l.errInvalidCredentials)
      else if (/too many requests|rate limit/i.test(msg)) setError(l.errTooManyRequests)
      else setError(msg || 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  const submitLabel = loading
    ? l.loading
    : mode === 'login' ? l.submit
    : mode === 'register' ? l.submitRegister
    : l.submitForgot

  const panelTitle =
    mode === 'login'    ? 'Bem-vindo de volta' :
    mode === 'register' ? 'Crie sua conta' :
                          'Recuperar senha'

  return (
    <div className="min-h-screen flex" style={{ fontFamily: "'Inter', 'Space Grotesk', sans-serif" }}>

      {/* ── Left photo panel ── */}
      <div
        className="hidden lg:flex lg:w-[42%] xl:w-[45%] relative flex-shrink-0 flex-col"
        style={{ background: 'linear-gradient(160deg, #000c30 0%, #001A70 55%, #0d2e8a 100%)' }}
      >
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url('https://images.unsplash.com/photo-1545558014-8692077e9b5c?auto=format&fit=crop&w=1200&q=80')`,
            opacity: 0.35,
          }}
        />
        {/* gradient at bottom for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

        <div className="relative z-10 flex flex-col h-full p-10">
          <a
            href="https://andregutto.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white hover:opacity-75 transition-opacity self-start"
            style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, letterSpacing: '-0.2px', textDecoration: 'none' }}
          >
            André Gutto
          </a>

          <div className="mt-auto">
            <p className="text-white text-[1.6rem] font-semibold leading-snug tracking-tight">
              Inteligência financeira<br />ao seu alcance.
            </p>
            <p className="text-white/45 text-xs mt-4 tracking-wide uppercase">
              Portfolio Tracker
            </p>
          </div>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col bg-white min-h-screen">

        {/* Top bar */}
        <div className="flex items-center justify-between px-8 pt-7">
          <a
            href="https://andregutto.com"
            target="_blank"
            rel="noopener noreferrer"
            className="lg:hidden hover:opacity-70 transition-opacity"
            style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, color: '#1B2F4E', textDecoration: 'none' }}
          >
            André Gutto
          </a>
          <div className="hidden lg:block" />
          <LanguageSelector />
        </div>

        {/* Centered form */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 py-10">
          <div className="w-full max-w-[400px]">

            <div className="mb-7">
              <img src="/favicon.svg" alt="Logo" className="w-9 h-9" />
            </div>

            <h1 className="text-[1.85rem] font-bold text-gray-900 mb-1.5 tracking-tight leading-tight">
              {panelTitle}
            </h1>
            <p className="text-gray-400 text-sm mb-7">
              {mode === 'forgot' ? l.forgotDesc : l.subtitle}
            </p>

            {mode !== 'forgot' && (
              <div className="flex bg-gray-100 rounded-xl p-1 gap-1 mb-6">
                {(['login', 'register'] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => switchMode(m)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                      mode === m ? 'bg-white shadow text-[#001A70]' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {m === 'login' ? l.loginTab : l.registerTab}
                  </button>
                ))}
              </div>
            )}

            {mode === 'forgot' && (
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-xs text-[#001A70] hover:underline flex items-center gap-1 mb-6"
              >
                ← {l.backToLogin}
              </button>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">

              {mode === 'register' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">{l.firstName}</label>
                    <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="André" className={INPUT_CLASS} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">{l.lastName}</label>
                    <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Gutto" className={INPUT_CLASS} />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">{l.email}</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="seu@email.com"
                  className={INPUT_CLASS}
                />
              </div>

              {mode !== 'forgot' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">{l.password}</label>
                  <div className="relative">
                    <input
                      type={showPwd ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      minLength={6}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      placeholder="••••••••"
                      className={`${INPUT_CLASS} pr-16`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(v => !v)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-medium"
                      tabIndex={-1}
                    >
                      {showPwd ? l.hidePwd : l.showPwd}
                    </button>
                  </div>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="text-xs text-gray-400 hover:text-[#001A70] mt-2 block transition-colors"
                    >
                      {l.forgotPwd}
                    </button>
                  )}
                </div>
              )}

              {mode === 'register' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">{t.profile.country}</label>
                      <select value={country} onChange={e => setCountry(e.target.value)} className={INPUT_CLASS}>
                        {COUNTRY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">{l.taxCountry}</label>
                      <select value={taxCountry} onChange={e => setTaxCountry(e.target.value)} className={INPUT_CLASS}>
                        {COUNTRY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">{l.birthdate}</label>
                    <input type="date" value={birthdate} onChange={e => setBirthdate(e.target.value)} className={INPUT_CLASS} />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">{l.defaultCurrency}</label>
                    <div className="flex gap-2">
                      {(['BRL', 'USD', 'EUR'] as Currency[]).map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCurrency(c)}
                          className={`flex-1 py-2.5 text-xs font-semibold rounded-xl border transition-colors ${
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

              {error && <p className="text-sm px-4 py-3 rounded-xl bg-red-50 text-red-700">{error}</p>}
              {info  && <p className="text-sm px-4 py-3 rounded-xl bg-blue-50 text-blue-700">{info}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#001A70] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[#002494] transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-1"
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
        </div>

        <div className="px-8 pb-7">
          <LoginFooter />
        </div>
      </div>
    </div>
  )
}
