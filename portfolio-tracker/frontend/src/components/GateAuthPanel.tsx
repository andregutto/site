import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import GoogleLogo from './GoogleLogo'

// Card de cadastro/login embutido dos gates de lead magnet — extraído de
// ResourcePublicPage quando o gate de viagem (SharedTripGatePage) passou a
// precisar do mesmo painel. Pressupõe que a página host já gravou
// sessionStorage['signup_source'] antes de renderizar: é de lá que o cadastro
// por e-mail/senha lê a atribuição, e no Google o bootstrap do AuthContext lê
// a mesma chave depois do redirect.

const F_SANS = 'var(--arvo-font-body)'
const F_DISPLAY = "'Playfair Display', Georgia, serif"

const inputBase: React.CSSProperties = {
  width: '100%', border: '1px solid var(--arvo-border)', borderRadius: 3, padding: '11px 14px',
  fontSize: 14.5, fontFamily: F_SANS, color: 'var(--arvo-fg)', background: '#FFFFFF', outline: 'none',
  transition: 'border-color 0.2s, box-shadow 0.2s', boxSizing: 'border-box' as const,
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.12em',
  textTransform: 'uppercase', color: 'var(--arvo-fg-soft)', marginBottom: 5,
}
const focusOn = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = 'var(--arvo-gold)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(200,184,154,0.25)' }
const focusOff = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = 'var(--arvo-border)'; e.currentTarget.style.boxShadow = 'none' }

// Fundo em tela cheia + container dos gates — layout inspirado no auth/signin
// da Epic (foto escurecida, card branco de login à esquerda, preview do
// conteúdo à direita). grid=false pro estado "não encontrado" (card único).
export function GateShell({ children, grid = true }: { children: React.ReactNode; grid?: boolean }) {
  const pageShell: React.CSSProperties = {
    minHeight: '100dvh', position: 'relative', display: 'flex', flexDirection: 'column',
    justifyContent: 'center', overflow: 'hidden', padding: 'calc(env(safe-area-inset-top,0px) + 24px) 16px 24px',
  }
  const bgPhoto: React.CSSProperties = {
    position: 'fixed', inset: 0, backgroundImage: "url('/brand/imagery/06-floresta-por-do-sol.jpg')",
    backgroundSize: 'cover', backgroundPosition: 'center 45%', filter: 'brightness(0.30) sepia(0.35) saturate(1.2)',
  }
  const bgOverlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'linear-gradient(to bottom right, rgba(13,13,13,0.60), rgba(13,13,13,0.90))' }

  return (
    <div style={pageShell}>
      <div style={bgPhoto} /><div style={bgOverlay} /><div className="arvo-grain" />
      {grid ? (
        <div style={{ position: 'relative', zIndex: 2, maxWidth: 980, margin: '0 auto', width: '100%' }} className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 lg:items-stretch">
          {children}
        </div>
      ) : (
        <div style={{ position: 'relative', zIndex: 2, maxWidth: 420, margin: '0 auto', width: '100%' }}>
          {children}
        </div>
      )}
    </div>
  )
}

interface Props {
  eyebrow: string
  // Path pra onde o retorno do Google deve cair — a própria URL do gate, que
  // com a sessão pronta já renderiza a versão logada (roteamento condicional
  // em App.tsx), sem passar visivelmente pelo /login.
  googleRedirectPath: string
  // Rótulo do submit no modo login (o gate de recurso usa "Liberar agora").
  loginSubmitLabel?: string
}

export default function GateAuthPanel({ eyebrow, googleRedirectPath, loginSubmitLabel }: Props) {
  const { signIn, signUp, signInWithGoogle } = useAuth()
  const { t } = useI18n()
  const l = t.login

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [formError, setFormError] = useState('')
  const [confirmSent, setConfirmSent] = useState(false)

  async function handleGoogle() {
    if (googleLoading) return
    setFormError('')
    setGoogleLoading(true)
    try {
      await signInWithGoogle(googleRedirectPath)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro desconhecido')
      setGoogleLoading(false)
    }
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (mode === 'register' && !acceptTerms) { setFormError(`${l.acceptTerms} ${l.termsLink}.`); return }
    setFormLoading(true)
    try {
      if (mode === 'login') {
        await signIn(email, password)
        // Sessão criada → o próximo render do router já troca pra versão logada.
      } else {
        await signUp(email, password, {
          first_name: firstName || undefined,
          signup_source: sessionStorage.getItem('signup_source') || undefined,
        })
        setConfirmSent(true)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (/email not confirmed/i.test(msg)) setFormError(l.errEmailNotConfirmed)
      else if (/invalid login credentials/i.test(msg)) setFormError(l.errInvalidCredentials)
      else if (/too many requests|rate limit/i.test(msg)) setFormError(l.errTooManyRequests)
      else setFormError(msg || 'Erro desconhecido')
    } finally {
      setFormLoading(false)
    }
  }

  return (
    <div style={{ background: '#FFFFFF', borderRadius: 12, padding: '32px 28px', boxShadow: '0 8px 40px rgba(0,0,0,0.35)' }}>
      <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
        <img src="/brand/logo/arvo-symbol-black.svg" width="16" height="16" alt="" />
        <span style={{ fontFamily: F_SANS, fontSize: 13, letterSpacing: '0.26em', textIndent: '0.26em', color: 'var(--arvo-black)' }}>arvo</span>
      </Link>

      {confirmSent ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <h2 style={{ fontFamily: F_DISPLAY, fontSize: 22, color: 'var(--arvo-black)', marginBottom: 12 }}>{l.registrationDone}</h2>
          <p style={{ fontFamily: F_SANS, fontSize: 14.5, color: 'var(--arvo-fg-soft)', lineHeight: 1.6 }}>
            {l.registrationDoneBody.replace('{email}', email)}
          </p>
        </div>
      ) : (
        <>
          <div style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.26em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)', marginBottom: 12 }}>
            {eyebrow}
          </div>
          <h1 style={{ fontFamily: F_DISPLAY, fontWeight: 400, fontSize: 26, color: 'var(--arvo-fg)', marginBottom: 24 }}>
            {mode === 'login' ? l.panelLogin : l.panelRegister}
          </h1>

          <div style={{ display: 'flex', gap: 16, marginBottom: 22 }}>
            {(['login', 'register'] as const).map(m => (
              <button key={m} type="button" onClick={() => { setMode(m); setFormError('') }}
                style={{ fontFamily: F_SANS, fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', padding: '4px 0', border: 0, background: 'transparent',
                  color: mode === m ? 'var(--arvo-black)' : 'rgba(13,13,13,0.35)',
                  borderBottom: mode === m ? '1px solid var(--arvo-black)' : '1px solid transparent', cursor: 'pointer' }}
              >
                {m === 'login' ? l.loginTab : l.registerTab}
              </button>
            ))}
          </div>

          <button type="button" onClick={handleGoogle} disabled={googleLoading}
            style={{ width: '100%', padding: '12px 20px', background: '#FFFFFF', border: '1px solid var(--arvo-border)', borderRadius: 3,
              fontFamily: F_SANS, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--arvo-fg)',
              cursor: googleLoading ? 'not-allowed' : 'pointer', opacity: googleLoading ? 0.6 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxSizing: 'border-box' }}
          >
            {googleLoading ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="animate-spin">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
                <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" opacity="0.75" />
              </svg>
            ) : <GoogleLogo />}
            {l.continueWithGoogle}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--arvo-border)' }} />
            <span style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }}>{l.orDivider}</span>
            <div style={{ flex: 1, height: 1, background: 'var(--arvo-border)' }} />
          </div>

          <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {mode === 'register' && (
              <div>
                <label style={labelStyle}>{l.firstName}</label>
                <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="André" style={inputBase} onFocus={focusOn} onBlur={focusOff} />
              </div>
            )}
            <div>
              <label style={labelStyle}>{l.email}</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="seu@email.com" style={inputBase} onFocus={focusOn} onBlur={focusOff} />
            </div>
            <div>
              <label style={labelStyle}>{l.password}</label>
              <div style={{ position: 'relative' }}>
                <input type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="••••••••"
                  style={{ ...inputBase, paddingRight: 56 }} onFocus={focusOn} onBlur={focusOff}
                />
                <button type="button" onClick={() => setShowPwd(v => !v)} tabIndex={-1}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: F_SANS, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }}
                >
                  {showPwd ? l.hidePwd : l.showPwd}
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
                <input type="checkbox" checked={acceptTerms} onChange={e => setAcceptTerms(e.target.checked)} style={{ width: 15, height: 15, accentColor: 'var(--arvo-black)', flexShrink: 0 }} />
                <span style={{ fontFamily: F_SANS, fontSize: 13.5, color: 'var(--arvo-fg-soft)' }}>
                  {l.acceptTerms}{' '}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--arvo-black)', textDecoration: 'underline' }}>{l.termsLink}</a>
                </span>
              </label>
            )}

            {formError && (
              <div style={{ fontFamily: F_SANS, fontSize: 13.5, padding: '10px 14px', borderRadius: 3, background: 'var(--arvo-beige)', borderLeft: '2px solid var(--arvo-red)', color: 'var(--arvo-fg)' }}>
                {formError}
              </div>
            )}

            <button type="submit" disabled={formLoading} style={{ ...inputBase, ...{ width: '100%', padding: '13px 24px', background: 'var(--arvo-black)', color: 'var(--arvo-offwhite, #F6F3EC)', fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', border: 'none', borderRadius: 3, cursor: 'pointer', opacity: formLoading ? 0.6 : 1 } }}>
              {formLoading ? l.loading : mode === 'login' ? (loginSubmitLabel ?? l.loginTab) : l.submitRegister}
            </button>
          </form>
        </>
      )}
    </div>
  )
}
