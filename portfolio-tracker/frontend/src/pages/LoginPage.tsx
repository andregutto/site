import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useI18n } from '../contexts/I18nContext'
import { useSearchParams } from 'react-router-dom'
import LoginFooter from '../components/LoginFooter'
import LanguageSelector from '../components/LanguageSelector'

type Mode = 'login' | 'register' | 'forgot'
type Currency = 'BRL' | 'USD' | 'EUR'

const BLUE   = '#0D0D0D'
const BG     = '#F2EDE4'
const DARK   = '#0D0D0D'
const GRAY   = 'rgba(13,13,13,0.5)'
const BORDER = 'rgba(13,13,13,0.1)'
const GOLD   = '#C8B89A'

const F_DISPLAY = "'Playfair Display', Georgia, serif"
const F_SANS    = "'Tenor Sans', sans-serif"

const LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  fontFamily: F_SANS,
  fontSize: 10,
  letterSpacing: '0.14em',
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
  fontFamily: F_SANS,
  color: DARK,
  background: BG,
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
  const [searchParams] = useSearchParams()

  const [mode, setMode]           = useState<Mode>((searchParams.get('mode') as Mode) || 'login')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [showPwd, setShowPwd]     = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [error, setError]         = useState('')
  const [info, setInfo]           = useState('')
  const [loading, setLoading]     = useState(false)

  const [firstName,  setFirstName]  = useState('')
  const [lastName,   setLastName]   = useState('')
  const [country,    setCountry]    = useState('')
  const [taxCountry, setTaxCountry] = useState('')
  const [birthdate,  setBirthdate]  = useState('')
  const [currency,   setCurrency]   = useState<Currency>('BRL')

  function resetExtras() {
    setFirstName(''); setLastName(''); setCountry('')
    setTaxCountry(''); setBirthdate(''); setCurrency('BRL')
    setConfirmPwd(''); setAcceptTerms(false)
  }

  function switchMode(m: Mode) {
    setMode(m); setError(''); setInfo('')
    if (m !== 'register') resetExtras()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setInfo('')
    if (mode === 'register') {
      if (password !== confirmPwd) { setError(l.passwordMismatch); return }
      if (!acceptTerms) { setError(`${l.acceptTerms} ${l.termsLink}.`); return }
    }
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
        setRegistered(true)
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
    mode === 'login'    ? l.panelLogin :
    mode === 'register' ? l.panelRegister :
                          l.panelForgot

  return (
    <div style={{ minHeight: '100vh', display: 'flex' }}>

      {/* ── Painel esquerdo ── */}
      <div
        className="hidden lg:flex lg:w-[44%] xl:w-[46%] flex-shrink-0 flex-col relative"
        style={{ background: '#0D0D0D' }}
      >
        <div
          className="absolute inset-0 bg-cover bg-center arvo-photo"
          style={{
            backgroundImage: `url('/brand/imagery/02-capins-dourados.jpg')`,
            opacity: 0.32,
          }}
        />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(13,13,13,0.75) 0%, transparent 60%)' }} />

        <div className="relative z-10 flex flex-col h-full" style={{ padding: '44px 48px' }}>
          <a
            href="https://andregutto.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:opacity-70 transition-opacity self-start"
            style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}
          >
            <img src="/brand/logo/arvo-symbol-offwhite.svg" width="22" height="22" alt="" />
            <span style={{ fontFamily: F_SANS, fontSize: 15, letterSpacing: '0.30em', textIndent: '0.30em', color: '#fff', lineHeight: 1 }}>arvo</span>
          </a>

          <div className="mt-auto">
            <p style={{ fontFamily: F_DISPLAY, fontSize: '1.8rem', fontWeight: 400, lineHeight: 1.2, color: '#fff', marginBottom: 0 }}>
              {l.tagline1}<br />
              <em style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.58)' }}>{l.tagline2}</em>
            </p>
          </div>
        </div>
      </div>

      {/* ── Painel direito ── */}
      <div className="flex-1 flex flex-col min-h-screen" style={{ background: BG }}>

        {/* Barra superior */}
        <div className="flex items-center justify-between px-4 pt-7 sm:px-12" style={{ display: 'flex' }}>
          <a
            href="https://andregutto.com"
            target="_blank"
            rel="noopener noreferrer"
            className="lg:hidden hover:opacity-70 transition-opacity"
            style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <img src="/brand/logo/arvo-symbol-black.svg" width="18" height="18" alt="" />
            <span style={{ fontFamily: F_SANS, fontSize: 14, letterSpacing: '0.30em', textIndent: '0.30em', color: BLUE, lineHeight: 1 }}>arvo</span>
          </a>
          <div className="hidden lg:block" />
          <LanguageSelector />
        </div>

        {/* Formulário centralizado */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-10 sm:px-12">
          <div style={{ width: '100%', maxWidth: 360 }}>

            {/* Tela de sucesso após cadastro */}
            {registered && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, textAlign: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(13,13,13,0.06)', border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 28, height: 28, color: BLUE }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </div>
                <div>
                  <h1 style={{ fontFamily: F_DISPLAY, fontSize: '1.8rem', fontWeight: 400, color: DARK, marginBottom: 12 }}>
                    {l.registrationDone}
                  </h1>
                  <p style={{ fontFamily: F_SANS, fontSize: 14, color: GRAY, lineHeight: 1.6 }}>
                    {l.registrationDoneBody.replace('{email}', email)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setRegistered(false); switchMode('login') }}
                  style={{
                    width: '100%', padding: '14px 24px', background: BLUE, color: BG,
                    fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
                    border: 'none', borderRadius: 3, cursor: 'pointer',
                  }}
                >
                  {l.goToLogin}
                </button>
              </div>
            )}

            {!registered && (<>

            {/* Eyebrow */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, flexShrink: 0 }} />
              <span style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: GRAY }}>
                Portfolio Tracker
              </span>
            </div>

            {/* Título */}
            <h1 style={{ fontFamily: F_DISPLAY, fontSize: '2rem', fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.5px', color: DARK, marginBottom: 8 }}>
              {panelTitle}
            </h1>
            <p style={{ fontFamily: F_SANS, fontSize: 14, color: GRAY, fontWeight: 300, marginBottom: 32, lineHeight: 1.6 }}>
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
                      fontFamily: F_SANS,
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
                style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: BLUE, background: 'none', border: 'none', cursor: 'pointer', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 6 }}
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
                      style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: F_SANS, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: GRAY }}
                      tabIndex={-1}
                    >
                      {showPwd ? l.hidePwd : l.showPwd}
                    </button>
                  </div>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: GRAY, background: 'none', border: 'none', cursor: 'pointer', marginTop: 6, display: 'block', transition: 'color 0.2s' }}
                    >
                      {l.forgotPwd}
                    </button>
                  )}
                </div>
              )}

              {/* Confirmar senha (apenas cadastro) */}
              {mode === 'register' && (
                <div>
                  <label style={LABEL_STYLE}>{l.confirmPwd}</label>
                  <input
                    type="password"
                    value={confirmPwd}
                    onChange={e => setConfirmPwd(e.target.value)}
                    required
                    autoComplete="new-password"
                    placeholder="••••••••"
                    style={{ ...INPUT_STYLE, borderColor: confirmPwd && confirmPwd !== password ? '#ef4444' : BORDER }}
                  />
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
                            fontFamily: F_SANS,
                            fontSize: 11,
                            letterSpacing: '0.08em',
                            border: `1px solid ${currency === c ? BLUE : BORDER}`,
                            borderRadius: 3,
                            cursor: 'pointer',
                            background: currency === c ? BLUE : BG,
                            color: currency === c ? BG : GRAY,
                            transition: 'all 0.2s',
                          }}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Aceitar termos */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={acceptTerms}
                      onChange={e => setAcceptTerms(e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: BLUE, flexShrink: 0 }}
                    />
                    <span style={{ fontFamily: F_SANS, fontSize: 13, color: GRAY }}>
                      {l.acceptTerms}{' '}
                      <a
                        href="/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: BLUE, textDecoration: 'underline' }}
                      >
                        {l.termsLink}
                      </a>
                    </span>
                  </label>
                </>
              )}

              {error && (
                <p style={{ fontFamily: F_SANS, fontSize: 13, padding: '12px 16px', borderRadius: 3, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
                  {error}
                </p>
              )}
              {info && (
                <p style={{ fontFamily: F_SANS, fontSize: 13, padding: '12px 16px', borderRadius: 3, background: '#eff6ff', color: '#1e3a5f', border: `1px solid ${BORDER}` }}>
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
                  fontFamily: F_SANS,
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
                onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#333' }}
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
            </>)}
          </div>
        </div>

        <div style={{ padding: '0 48px 28px' }}>
          <LoginFooter />
        </div>
      </div>
    </div>
  )
}
