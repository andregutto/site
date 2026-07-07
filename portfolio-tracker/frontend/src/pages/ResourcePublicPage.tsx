import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import ArvoLoader from '../components/ArvoLoader'
import GoogleLogo from '../components/GoogleLogo'

// Página pública de um Recurso (/resources/:slug) — SÓ pro visitante deslogado
// (App.tsx só monta esta rota quando !user; assim que a sessão existe, a
// mesma URL passa a renderizar ResourceDetailPage dentro do AppLayout — ver
// o roteamento condicional em App.tsx). É o destino dos lead magnets dos
// vídeos do canal: layout inspirado no auth/signin da Epic — foto de fundo
// em tela cheia, login embutido à esquerda (sem sair da página), info do
// recurso à direita. Depois de autenticado (login por senha, ou volta do
// Google/confirmação de e-mail), o React Router troca sozinho pra
// ResourceDetailPage — o unlock em si (e o auto-unlock via
// pending_resource_slug) vive lá, não aqui.

const F_SANS    = "var(--arvo-font-body)"
const F_DISPLAY = "'Playfair Display', Georgia, serif"

interface ResourcePreview {
  slug: string
  title: string
  description: string | null
  resource_type: 'file' | 'link' | 'content'
  preview_image_url: string | null
  visibility: 'free' | 'plus' | 'beta'
}

const inputBase: React.CSSProperties = {
  width: '100%', border: '1px solid var(--arvo-border)', borderRadius: 3, padding: '11px 14px',
  fontSize: 13.5, fontFamily: F_SANS, color: 'var(--arvo-fg)', background: '#FFFFFF', outline: 'none',
  transition: 'border-color 0.2s, box-shadow 0.2s', boxSizing: 'border-box' as const,
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.12em',
  textTransform: 'uppercase', color: 'var(--arvo-fg-soft)', marginBottom: 5,
}
const focusOn = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = 'var(--arvo-gold)'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(200,184,154,0.25)' }
const focusOff = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = 'var(--arvo-border)'; e.currentTarget.style.boxShadow = 'none' }

export default function ResourcePublicPage() {
  const { slug } = useParams<{ slug: string }>()
  const { signIn, signUp, signInWithGoogle } = useAuth()
  const { t } = useI18n()
  const r = t.resources
  const l = t.login

  const [preview, setPreview] = useState<ResourcePreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(true)
  const [notFound, setNotFound] = useState(false)

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

  useEffect(() => {
    if (!slug) return
    const params = new URLSearchParams(window.location.search)
    const utm: Record<string, string> = {}
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
      const v = params.get(key)
      if (v) utm[key] = v
    }
    if (Object.keys(utm).length) sessionStorage.setItem('resource_utm', JSON.stringify(utm))
    sessionStorage.setItem('signup_source', `resource:${slug}`)
    // Sinaliza pra ResourceDetailPage disparar o unlock sozinha assim que a
    // sessão existir (login por senha aqui mesmo, ou volta do Google/e-mail).
    sessionStorage.setItem('pending_resource_slug', slug)

    fetch(`/api/resources/public/${slug}${window.location.search}`)
      .then(async res => {
        if (!res.ok) { setNotFound(true); return }
        setPreview(await res.json())
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoadingPreview(false))
  }, [slug])

  async function handleGoogle() {
    if (googleLoading) return
    setFormError('')
    setGoogleLoading(true)
    try {
      // Passa o próprio path do recurso: o retorno do Google cai direto na
      // mesma URL (que aí já renderiza ResourceDetailPage, sessão pronta).
      await signInWithGoogle(`/resources/${slug}`)
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
        // Sessão criada → o próximo render do router já troca pra ResourceDetailPage.
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

  if (loadingPreview) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--arvo-black)' }}>
        <ArvoLoader size={40} style={{ color: 'var(--arvo-gold)' }} />
      </div>
    )
  }

  const pageShell: React.CSSProperties = {
    minHeight: '100dvh', position: 'relative', display: 'flex', flexDirection: 'column',
    justifyContent: 'center', overflow: 'hidden', padding: 'calc(env(safe-area-inset-top,0px) + 24px) 16px 24px',
  }
  const bgPhoto: React.CSSProperties = {
    position: 'fixed', inset: 0, backgroundImage: "url('/brand/imagery/06-floresta-por-do-sol.jpg')",
    backgroundSize: 'cover', backgroundPosition: 'center 45%', filter: 'brightness(0.30) sepia(0.35) saturate(1.2)',
  }
  const bgOverlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'linear-gradient(to bottom right, rgba(13,13,13,0.60), rgba(13,13,13,0.90))' }

  if (notFound || !preview) {
    return (
      <div style={pageShell}>
        <div style={bgPhoto} /><div style={bgOverlay} /><div className="arvo-grain" />
        <div style={{ position: 'relative', zIndex: 2, maxWidth: 420, margin: '0 auto', textAlign: 'center', background: '#FFFFFF', borderRadius: 12, padding: '36px 28px' }}>
          <p style={{ fontFamily: F_SANS, fontSize: 14, fontWeight: 600, color: 'var(--arvo-black)', margin: 0 }}>{r.notFound}</p>
          <Link to="/" style={{ fontFamily: F_SANS, fontSize: 13, color: 'var(--arvo-fg-soft)' }}>{r.backToApp}</Link>
        </div>
      </div>
    )
  }

  return (
    <div style={pageShell}>
      <div style={bgPhoto} /><div style={bgOverlay} /><div className="arvo-grain" />
      <div style={{ position: 'relative', zIndex: 2, maxWidth: 980, margin: '0 auto', width: '100%' }} className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 lg:items-stretch">

        {/* ── Left: auth panel ── */}
        <div style={{ background: '#FFFFFF', borderRadius: 12, padding: '32px 28px', boxShadow: '0 8px 40px rgba(0,0,0,0.35)' }}>
          <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
            <img src="/brand/logo/arvo-symbol-black.svg" width="16" height="16" alt="" />
            <span style={{ fontFamily: F_SANS, fontSize: 12, letterSpacing: '0.26em', textIndent: '0.26em', color: 'var(--arvo-black)' }}>arvo</span>
          </Link>

          {confirmSent ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <h2 style={{ fontFamily: F_DISPLAY, fontSize: 22, color: 'var(--arvo-black)', marginBottom: 12 }}>{l.registrationDone}</h2>
              <p style={{ fontFamily: F_SANS, fontSize: 13.5, color: 'var(--arvo-fg-soft)', lineHeight: 1.6 }}>
                {l.registrationDoneBody.replace('{email}', email)}
              </p>
            </div>
          ) : (
            <>
              <div style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.26em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)', marginBottom: 12 }}>
                {r.gateEyebrow}
              </div>
              <h1 style={{ fontFamily: F_DISPLAY, fontWeight: 400, fontSize: 26, color: 'var(--arvo-fg)', marginBottom: 24 }}>
                {mode === 'login' ? l.panelLogin : l.panelRegister}
              </h1>

              <div style={{ display: 'flex', gap: 16, marginBottom: 22 }}>
                {(['login', 'register'] as const).map(m => (
                  <button key={m} type="button" onClick={() => { setMode(m); setFormError('') }}
                    style={{ fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', padding: '4px 0', border: 0, background: 'transparent',
                      color: mode === m ? 'var(--arvo-black)' : 'rgba(13,13,13,0.35)',
                      borderBottom: mode === m ? '1px solid var(--arvo-black)' : '1px solid transparent', cursor: 'pointer' }}
                  >
                    {m === 'login' ? l.loginTab : l.registerTab}
                  </button>
                ))}
              </div>

              <button type="button" onClick={handleGoogle} disabled={googleLoading}
                style={{ width: '100%', padding: '12px 20px', background: '#FFFFFF', border: '1px solid var(--arvo-border)', borderRadius: 3,
                  fontFamily: F_SANS, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--arvo-fg)',
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
                    <span style={{ fontFamily: F_SANS, fontSize: 12.5, color: 'var(--arvo-fg-soft)' }}>
                      {l.acceptTerms}{' '}
                      <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--arvo-black)', textDecoration: 'underline' }}>{l.termsLink}</a>
                    </span>
                  </label>
                )}

                {formError && (
                  <div style={{ fontFamily: F_SANS, fontSize: 12.5, padding: '10px 14px', borderRadius: 3, background: 'var(--arvo-beige)', borderLeft: '2px solid var(--arvo-red)', color: 'var(--arvo-fg)' }}>
                    {formError}
                  </div>
                )}

                <button type="submit" disabled={formLoading} style={{ ...inputBase, ...{ width: '100%', padding: '13px 24px', background: 'var(--arvo-black)', color: 'var(--arvo-offwhite, #F6F3EC)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', border: 'none', borderRadius: 3, cursor: 'pointer', opacity: formLoading ? 0.6 : 1 } }}>
                  {formLoading ? l.loading : mode === 'login' ? r.unlockCta : l.submitRegister}
                </button>
              </form>
            </>
          )}
        </div>

        {/* ── Right: resource info — um card só, mesma altura do card de
            login (grid items-stretch), imagem contida dentro dele em vez
            de flutuar solta por baixo do texto parecendo um post. ── */}
        <div style={{
          background: 'rgba(20,18,15,0.55)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
          border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, overflow: 'hidden',
          display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
        }}>
          <div style={{ height: 180, flexShrink: 0 }}>
            <img
              src={preview.preview_image_url || '/brand/imagery/arvo-fallback-recurso.jpg'}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: preview.preview_image_url ? '50% 50%' : '50% 30%', display: 'block' }}
            />
          </div>

          <div style={{ padding: '28px 28px', display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
            <div>
              <span style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--arvo-gold)' }}>
                {preview.visibility === 'free' ? r.free : preview.visibility === 'plus' ? r.plus : r.beta}
              </span>
              <h1 style={{ fontFamily: F_DISPLAY, fontWeight: 400, fontSize: 'clamp(22px, 2.6vw, 28px)', color: 'var(--arvo-offwhite, #F6F3EC)', margin: '8px 0 0', lineHeight: 1.2 }}>
                {preview.title}
              </h1>
            </div>

            {preview.description && (
              <p style={{ fontFamily: F_SANS, fontSize: 14, color: 'rgba(242,237,228,0.75)', lineHeight: 1.6, margin: 0 }}>
                {preview.description}
              </p>
            )}

            {preview.visibility !== 'free' ? (
              <p style={{ fontFamily: F_SANS, fontSize: 13, color: 'rgba(242,237,228,0.6)', margin: '0 0 0 0', marginTop: 'auto' }}>{r.membersSoon}</p>
            ) : (
              <p style={{ fontFamily: F_SANS, fontSize: 12.5, color: 'rgba(242,237,228,0.5)', letterSpacing: '0.04em', margin: 0, marginTop: 'auto' }}>
                {r.unlockHint}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
