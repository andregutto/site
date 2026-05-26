import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useI18n } from '../contexts/I18nContext'
import { useSearchParams } from 'react-router-dom'
import LoginFooter from '../components/LoginFooter'
import LanguageSelector from '../components/LanguageSelector'

type Mode = 'login' | 'register' | 'forgot'
type Currency = 'BRL' | 'USD' | 'EUR'

const F_SANS    = "'Tenor Sans', sans-serif"
const F_DISPLAY = "'Playfair Display', serif"

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

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: F_SANS,
  fontSize: 10,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--arvo-fg-soft)',
  marginBottom: 6,
}

const inputBase: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--arvo-border)',
  borderRadius: 3,
  padding: '12px 16px',
  fontSize: 14,
  fontFamily: F_SANS,
  color: 'var(--arvo-fg)',
  background: 'var(--arvo-offwhite)',
  outline: 'none',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  boxSizing: 'border-box' as const,
}

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
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 1.1fr', fontFamily: F_SANS, background: 'var(--arvo-offwhite)' }}
      className="grid-cols-1 lg:grid-cols-[1fr_1.1fr]"
    >

      {/* ── Left — editorial ── */}
      <aside
        className="hidden lg:flex flex-col"
        style={{ background: 'var(--arvo-black)', color: 'var(--arvo-fg-on-dark)', padding: '64px 56px', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}
      >
        {/* Photo bg */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: "url('/brand/imagery/02-capins-dourados.jpg')", backgroundSize: 'cover', backgroundPosition: 'center', filter: 'brightness(0.30) sepia(0.40) saturate(1.20)' }} />
        {/* Overlay */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom right, rgba(13,13,13,0.55), rgba(13,13,13,0.92))' }} />
        {/* Grain */}
        <div className="arvo-grain" />

        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ fontFamily: F_SANS, fontSize: 20, letterSpacing: '0.30em', textIndent: '0.30em', color: 'var(--arvo-offwhite)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/brand/logo/arvo-symbol-gold.svg" width="24" height="25" alt="" />
            arvo
          </div>
          <div style={{ fontFamily: F_DISPLAY, fontStyle: 'italic', fontSize: 36, lineHeight: 1.2, color: 'var(--arvo-gold)', maxWidth: 380, marginTop: 60 }}>
            "{l.tagline1}"
          </div>
          <div style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.30em', textTransform: 'uppercase', color: 'rgba(242,237,228,0.45)', marginTop: 24 }}>
            — manifesto, 2026
          </div>
        </div>

        <div style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.18em', color: 'rgba(242,237,228,0.5)', position: 'relative', zIndex: 2 }}>
          cultive o que é seu
        </div>
      </aside>

      {/* ── Right — form ── */}
      <main style={{ padding: '64px 72px', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'var(--arvo-offwhite)' }}
        className="px-6 py-12 lg:px-[72px] lg:py-[64px]"
      >
        {/* Lang selector row */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 40 }}>
          <LanguageSelector />
        </div>

        {/* Success state */}
        {registered && (
          <div style={{ maxWidth: 440, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(13,13,13,0.06)', border: '1px solid var(--arvo-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 28, height: 28, color: 'var(--arvo-black)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <div>
              <h1 style={{ fontFamily: F_SANS, fontSize: 32, letterSpacing: '0.04em', color: 'var(--arvo-fg)', marginBottom: 12 }}>
                {l.registrationDone}
              </h1>
              <p style={{ fontFamily: F_SANS, fontSize: 14, color: 'var(--arvo-fg-soft)', lineHeight: 1.6 }}>
                {l.registrationDoneBody.replace('{email}', email)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setRegistered(false); switchMode('login') }}
              style={{ width: '100%', padding: '14px 24px', background: 'var(--arvo-black)', color: 'var(--arvo-offwhite)', fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', border: 'none', borderRadius: 3, cursor: 'pointer' }}
            >
              {l.goToLogin}
            </button>
          </div>
        )}

        {!registered && (
          <div style={{ maxWidth: 440, width: '100%' }}>

            {/* Eyebrow */}
            <div style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.30em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)', marginBottom: 16 }}>
              Acesso
            </div>

            {/* h1 */}
            <h1 style={{ fontFamily: F_SANS, fontSize: 44, letterSpacing: '0.06em', lineHeight: 1.15, color: 'var(--arvo-fg)', marginBottom: 12, maxWidth: 460 }}>
              {panelTitle}
            </h1>

            {/* Subtitle */}
            {mode !== 'forgot' && (
              <p style={{ fontFamily: F_DISPLAY, fontStyle: 'italic', fontSize: 17, color: 'var(--arvo-terracotta)', marginBottom: 40 }}>
                {l.subtitle}
              </p>
            )}
            {mode === 'forgot' && (
              <p style={{ fontFamily: F_SANS, fontSize: 14, color: 'var(--arvo-fg-soft)', marginBottom: 32, lineHeight: 1.6 }}>
                {l.forgotDesc}
              </p>
            )}

            {/* Mode tabs */}
            {mode !== 'forgot' && (
              <div style={{ display: 'flex', gap: 18, marginBottom: 32 }}>
                {(['login', 'register'] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => switchMode(m)}
                    style={{
                      fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase',
                      padding: '4px 0', border: 0, background: 'transparent',
                      color: mode === m ? 'var(--arvo-black)' : 'rgba(13,13,13,0.35)',
                      borderBottom: mode === m ? '1px solid var(--arvo-black)' : '1px solid transparent',
                      cursor: 'pointer', transition: 'color 0.2s',
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
                style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--arvo-black)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                ← {l.backToLogin}
              </button>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

              {mode === 'register' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>{l.firstName}</label>
                    <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="André" style={inputBase}
                      onFocus={e => { e.currentTarget.style.borderColor = 'var(--arvo-gold)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(200,184,154,0.25)' }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'var(--arvo-border)'; e.currentTarget.style.boxShadow = 'none' }}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>{l.lastName}</label>
                    <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Gutto" style={inputBase}
                      onFocus={e => { e.currentTarget.style.borderColor = 'var(--arvo-gold)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(200,184,154,0.25)' }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'var(--arvo-border)'; e.currentTarget.style.boxShadow = 'none' }}
                    />
                  </div>
                </div>
              )}

              <div>
                <label style={labelStyle}>{l.email}</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="seu@email.com" style={inputBase}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--arvo-gold)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(200,184,154,0.25)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--arvo-border)'; e.currentTarget.style.boxShadow = 'none' }}
                />
              </div>

              {mode !== 'forgot' && (
                <div>
                  <label style={labelStyle}>{l.password}</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPwd ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required minLength={6}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      placeholder="••••••••"
                      style={{ ...inputBase, paddingRight: 56 }}
                      onFocus={e => { e.currentTarget.style.borderColor = 'var(--arvo-gold)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(200,184,154,0.25)' }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'var(--arvo-border)'; e.currentTarget.style.boxShadow = 'none' }}
                    />
                    <button type="button" onClick={() => setShowPwd(v => !v)} tabIndex={-1}
                      style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: F_SANS, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }}
                    >
                      {showPwd ? l.hidePwd : l.showPwd}
                    </button>
                  </div>
                  {mode === 'login' && (
                    <button type="button" onClick={() => switchMode('forgot')}
                      style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 6, display: 'block', borderBottom: '1px solid transparent', transition: 'color 0.2s' }}
                    >
                      {l.forgotPwd}
                    </button>
                  )}
                </div>
              )}

              {mode === 'register' && (
                <div>
                  <label style={labelStyle}>{l.confirmPwd}</label>
                  <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} required autoComplete="new-password" placeholder="••••••••"
                    style={{ ...inputBase, borderColor: confirmPwd && confirmPwd !== password ? '#ef4444' : 'var(--arvo-border)' }}
                    onFocus={e => { e.currentTarget.style.borderColor = 'var(--arvo-gold)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(200,184,154,0.25)' }}
                    onBlur={e => { e.currentTarget.style.borderColor = confirmPwd && confirmPwd !== password ? '#ef4444' : 'var(--arvo-border)'; e.currentTarget.style.boxShadow = 'none' }}
                  />
                </div>
              )}

              {mode === 'register' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>{t.profile.country}</label>
                      <select value={country} onChange={e => setCountry(e.target.value)} style={{ ...inputBase, appearance: 'none' as never }}>
                        {COUNTRY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>{l.taxCountry}</label>
                      <select value={taxCountry} onChange={e => setTaxCountry(e.target.value)} style={{ ...inputBase, appearance: 'none' as never }}>
                        {COUNTRY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>{l.birthdate}</label>
                    <input type="date" value={birthdate} onChange={e => setBirthdate(e.target.value)} style={inputBase}
                      onFocus={e => { e.currentTarget.style.borderColor = 'var(--arvo-gold)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(200,184,154,0.25)' }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'var(--arvo-border)'; e.currentTarget.style.boxShadow = 'none' }}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>{l.defaultCurrency}</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {(['BRL', 'USD', 'EUR'] as Currency[]).map(c => (
                        <button key={c} type="button" onClick={() => setCurrency(c)}
                          style={{ flex: 1, padding: '10px 0', fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.08em', border: `1px solid ${currency === c ? 'var(--arvo-black)' : 'var(--arvo-border)'}`, borderRadius: 3, cursor: 'pointer', background: currency === c ? 'var(--arvo-black)' : 'var(--arvo-offwhite)', color: currency === c ? 'var(--arvo-offwhite)' : 'var(--arvo-fg-soft)', transition: 'all 0.2s' }}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={acceptTerms} onChange={e => setAcceptTerms(e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: 'var(--arvo-black)', flexShrink: 0 }}
                    />
                    <span style={{ fontFamily: F_SANS, fontSize: 13, color: 'var(--arvo-fg-soft)' }}>
                      {l.acceptTerms}{' '}
                      <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--arvo-black)', textDecoration: 'underline' }}>
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
                <p style={{ fontFamily: F_SANS, fontSize: 13, padding: '12px 16px', borderRadius: 3, background: '#eff6ff', color: '#1e3a5f', border: '1px solid var(--arvo-border)' }}>
                  {info}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{ width: '100%', padding: '14px 24px', background: 'var(--arvo-black)', color: 'var(--arvo-offwhite)', fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', border: 'none', borderRadius: 3, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background 0.2s', marginTop: 4, boxSizing: 'border-box' }}
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

            <p style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.05em', color: 'var(--arvo-fg-soft)', marginTop: 32, maxWidth: 440, lineHeight: 1.7 }}>
              ao entrar, você aceita os termos de uso e a política de privacidade. arvo guarda seus dados em servidores na União Europeia.
            </p>
          </div>
        )}

        <div style={{ marginTop: 'auto', paddingTop: 32 }}>
          <LoginFooter />
        </div>
      </main>
    </div>
  )
}
