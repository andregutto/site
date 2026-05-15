import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useI18n } from '../contexts/I18nContext'
import LoginFooter from '../components/LoginFooter'
import LanguageSelector from '../components/LanguageSelector'

type Mode = 'login' | 'register' | 'forgot'
type Currency = 'BRL' | 'USD' | 'EUR'

// Main site design tokens
const BLUE   = '#1B2F4E'
const BG     = '#FAFAF8'
const DARK   = '#111110'
const GRAY   = '#6B6B67'
const BORDER = '#E0DDD5'
const BORDEAUX = '#8B1A2F'

const F_DISPLAY = "'Playfair Display', serif"
const F_MONO    = "'DM Mono', monospace"
const F_BODY    = "'DM Sans', sans-serif"

const LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  fontFamily: F_MONO,
  fontSize: 10,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: GRAY,
  marginBottom: 6,
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  border: `1px solid ${BORDER}`,
  borderRadius: 3,
  padding: '12px 16px',
  fontSize: 14,
  fontFamily: F_BODY,
  color: DARK,
  background: '#fff',
  outline: 'none',
  transition: 'border-color 0.2s',
}

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
    mode === 'login'    ? 'Acesse sua conta' :
    mode === 'register' ? 'Crie sua conta' :
                          'Recuperar senha'

  return (
    <div style={{ minHeight: '100vh', display: 'flex' }}>

      {/* ── Painel esquerdo ── */}
      <div
        className="hidden lg:flex lg:w-[44%] xl:w-[46%] flex-shrink-0 flex-col relative"
        style={{ background: 'linear-gradient(160deg, #0c1a2e 0%, #1B2F4E 100%)' }}
      >
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url('https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=1200&q=80')`,
            opacity: 0.38,
          }}
        />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(10,20,40,0.65) 0%, transparent 55%)' }} />

        <div className="relative z-10 flex flex-col h-full" style={{ padding: '44px 48px' }}>
          <a
            href="https://andregutto.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:opacity-70 transition-opacity self-start"
            style={{ fontFamily: F_DISPLAY, fontSize: 22, fontWeight: 400, color: '#fff', textDecoration: 'none', letterSpacing: '-0.2px' }}
          >
            André Gutto
          </a>

          <div className="mt-auto">
            <p style={{ fontFamily: F_DISPLAY, fontSize: '1.8rem', fontWeight: 400, lineHeight: 1.2, color: '#fff', marginBottom: 0 }}>
              O seu dinheiro,<br />
              <em style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.58)' }}>trabalhando por você.</em>
            </p>
          </div>
        </div>
      </div>

      {/* ── Painel direito ── */}
      <div className="flex-1 flex flex-col min-h-screen" style={{ background: BG }}>

        {/* Barra superior */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '28px 48px 0' }}>
          <a
            href="https://andregutto.com"
            target="_blank"
            rel="noopener noreferrer"
            className="lg:hidden hover:opacity-70 transition-opacity"
            style={{ fontFamily: F_DISPLAY, fontSize: 17, color: BLUE, textDecoration: 'none' }}
          >
            André Gutto
          </a>
          <div className="hidden lg:block" />
          <LanguageSelector />
        </div>

        {/* Formulário centralizado */}
        <div className="flex-1 flex flex-col items-center justify-center" style={{ padding: '40px 48px' }}>
          <div style={{ width: '100%', maxWidth: 360 }}>

            {/* Eyebrow */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: BORDEAUX, flexShrink: 0 }} />
              <span style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: GRAY }}>
                Portfolio Tracker
              </span>
            </div>

            {/* Título */}
            <h1 style={{ fontFamily: F_DISPLAY, fontSize: '2rem', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.5px', color: DARK, marginBottom: 8 }}>
              {panelTitle}
            </h1>
            <p style={{ fontFamily: F_BODY, fontSize: 14, color: GRAY, fontWeight: 300, marginBottom: 32, lineHeight: 1.6 }}>
              {mode === 'forgot' ? l.forgotDesc : l.subtitle}
            </p>

            {/* Abas login / cadastro */}
            {mode !== 'forgot' && (
              <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}`, marginBottom: 28 }}>
                {(['login', 'register'] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => switchMode(m)}
                    style={{
                      padding: '8px 0',
                      marginRight: 24,
                      marginBottom: -1,
                      background: 'none',
                      border: 'none',
                      borderBottom: mode === m ? `2px solid ${BLUE}` : '2px solid transparent',
                      cursor: 'pointer',
                      fontFamily: F_MONO,
                      fontSize: 11,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: mode === m ? BLUE : GRAY,
                      transition: 'color 0.2s, border-color 0.2s',
                    }}
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
                style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: BLUE, background: 'none', border: 'none', cursor: 'pointer', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                ← {l.backToLogin}
              </button>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Cadastro: nome + sobrenome */}
              {mode === 'register' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={LABEL_STYLE}>{l.firstName}</label>
                    <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="André" style={INPUT_STYLE} />
                  </div>
                  <div>
                    <label style={LABEL_STYLE}>{l.lastName}</label>
                    <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Gutto" style={INPUT_STYLE} />
                  </div>
                </div>
              )}

              {/* Email */}
              <div>
                <label style={LABEL_STYLE}>{l.email}</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="seu@email.com"
                  style={INPUT_STYLE}
                />
              </div>

              {/* Senha */}
              {mode !== 'forgot' && (
                <div>
                  <label style={LABEL_STYLE}>{l.password}</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPwd ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      minLength={6}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      placeholder="••••••••"
                      style={{ ...INPUT_STYLE, paddingRight: 56 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(v => !v)}
                      style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: F_MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: GRAY }}
                      tabIndex={-1}
                    >
                      {showPwd ? l.hidePwd : l.showPwd}
                    </button>
                  </div>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      style={{ fontFamily: F_MONO, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: GRAY, background: 'none', border: 'none', cursor: 'pointer', marginTop: 6, display: 'block', transition: 'color 0.2s' }}
                    >
                      {l.forgotPwd}
                    </button>
                  )}
                </div>
              )}

              {/* Campos extras de cadastro */}
              {mode === 'register' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={LABEL_STYLE}>{t.profile.country}</label>
                      <select value={country} onChange={e => setCountry(e.target.value)} style={{ ...INPUT_STYLE, appearance: 'none' }}>
                        {COUNTRY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={LABEL_STYLE}>{l.taxCountry}</label>
                      <select value={taxCountry} onChange={e => setTaxCountry(e.target.value)} style={{ ...INPUT_STYLE, appearance: 'none' }}>
                        {COUNTRY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style={LABEL_STYLE}>{l.birthdate}</label>
                    <input type="date" value={birthdate} onChange={e => setBirthdate(e.target.value)} style={INPUT_STYLE} />
                  </div>

                  <div>
                    <label style={LABEL_STYLE}>{l.defaultCurrency}</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {(['BRL', 'USD', 'EUR'] as Currency[]).map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCurrency(c)}
                          style={{
                            flex: 1,
                            padding: '10px 0',
                            fontFamily: F_MONO,
                            fontSize: 11,
                            letterSpacing: '0.08em',
                            border: `1px solid ${currency === c ? BLUE : BORDER}`,
                            borderRadius: 3,
                            cursor: 'pointer',
                            background: currency === c ? BLUE : '#fff',
                            color: currency === c ? BG : GRAY,
                            transition: 'all 0.2s',
                          }}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {error && (
                <p style={{ fontFamily: F_BODY, fontSize: 13, padding: '12px 16px', borderRadius: 3, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
                  {error}
                </p>
              )}
              {info && (
                <p style={{ fontFamily: F_BODY, fontSize: 13, padding: '12px 16px', borderRadius: 3, background: '#eff6ff', color: '#1e3a5f', border: `1px solid ${BORDER}` }}>
                  {info}
                </p>
              )}

              {/* Botão de submit — estilo site principal */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '14px 24px',
                  background: BLUE,
                  color: BG,
                  fontFamily: F_MONO,
                  fontSize: 11,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  border: 'none',
                  borderRadius: 3,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  transition: 'background 0.2s',
                  marginTop: 4,
                }}
                onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#2A4A72' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = BLUE }}
              >
                {loading && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="animate-spin">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
                    <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" opacity="0.75" />
                  </svg>
                )}
                {submitLabel}
              </button>
            </form>
          </div>
        </div>

        <div style={{ padding: '0 48px 28px' }}>
          <LoginFooter />
        </div>
      </div>
    </div>
  )
}
