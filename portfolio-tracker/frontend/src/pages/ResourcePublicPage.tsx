import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { apiFetch } from '../lib/api'
import ArvoLoader from '../components/ArvoLoader'

// Página pública de um Recurso (/recursos/:slug) — o destino dos lead magnets
// dos vídeos do canal. Mostra título/descrição/preview pra qualquer visitante,
// mas o download/conteúdo só libera com cadastro/login (gate). Fluxo espelhado
// do AcceptTripInvitePage: sem login → guarda o slug em sessionStorage →
// /login → volta e libera sozinho. O signup_source vai no metadata do cadastro
// pra medir qual vídeo converteu (profiles.signup_source).

interface ResourcePreview {
  slug: string
  title: string
  description: string | null
  resource_type: 'file' | 'link' | 'content'
  preview_image_url: string | null
  visibility: 'free' | 'paid'
}

interface UnlockResult {
  type: 'file' | 'link' | 'content'
  download_url?: string
  external_url?: string
  content_md?: string
}

function getStoredUtm(): Record<string, string> {
  try { return JSON.parse(sessionStorage.getItem('resource_utm') ?? '{}') } catch { return {} }
}

export default function ResourcePublicPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const { t } = useI18n()
  const r = t.resources

  const [preview, setPreview] = useState<ResourcePreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const [result, setResult] = useState<UnlockResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!slug) return
    // Captura utm_* da URL: vai junto no evento de view agora e no unlock depois
    const params = new URLSearchParams(window.location.search)
    const utm: Record<string, string> = {}
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
      const v = params.get(key)
      if (v) utm[key] = v
    }
    if (Object.keys(utm).length) sessionStorage.setItem('resource_utm', JSON.stringify(utm))
    // Qualquer cadastro feito a partir desta visita é atribuído ao recurso
    sessionStorage.setItem('signup_source', `resource:${slug}`)

    fetch(`/api/resources/public/${slug}${window.location.search}`)
      .then(async res => {
        if (!res.ok) { setNotFound(true); return }
        setPreview(await res.json())
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoadingPreview(false))
  }, [slug])

  async function handleUnlock() {
    if (unlocking) return
    setUnlocking(true)
    setError('')
    try {
      const res = await apiFetch<UnlockResult>(`/resources/${slug}/unlock`, {
        method: 'POST',
        body: JSON.stringify(getStoredUtm()),
      })
      setResult(res)
      if (res.type === 'file' && res.download_url) window.location.assign(res.download_url)
    } catch (ex: unknown) {
      setError((ex as Error).message)
    } finally {
      setUnlocking(false)
    }
  }

  // Voltou logado do fluxo de cadastro/login → libera sozinho
  useEffect(() => {
    if (!user || authLoading || !preview) return
    const pending = sessionStorage.getItem('pending_resource_slug')
    if (pending && pending === slug) {
      sessionStorage.removeItem('pending_resource_slug')
      if (preview.visibility === 'free') handleUnlock()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, preview])

  function goToLogin(mode: 'register' | 'login') {
    sessionStorage.setItem('pending_resource_slug', slug ?? '')
    navigate(mode === 'register' ? '/login?mode=register' : '/login')
  }

  if (loadingPreview || authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--arvo-offwhite)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <ArvoLoader size={40} style={{ color: 'var(--arvo-gold)' }} />
      </div>
    )
  }

  const btnPrimary: React.CSSProperties = {
    width: '100%', padding: '13px 24px', background: 'var(--arvo-black)', color: 'var(--arvo-offwhite, #F6F3EC)',
    fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
    border: 'none', borderRadius: 6, cursor: 'pointer',
  }
  const btnGhost: React.CSSProperties = {
    width: '100%', padding: '12px 24px', background: 'transparent', color: 'var(--arvo-fg-soft)',
    fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
    border: '1px solid var(--arvo-border)', borderRadius: 6, cursor: 'pointer',
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--arvo-offwhite)', padding: 'calc(env(safe-area-inset-top, 0px) + 32px) 16px 32px' }}>
      <div style={{ width: '100%', maxWidth: 460, background: 'white', borderRadius: 16, border: '1px solid var(--arvo-border)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ background: 'var(--arvo-black)', padding: '24px 24px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/brand/logo/arvo-symbol-gold.svg" width="20" height="21" alt="" />
          <span style={{ fontFamily: "'DM Sans', system-ui", fontSize: 14, letterSpacing: '0.28em', color: 'var(--arvo-gold)' }}>arvo recursos</span>
        </div>

        {notFound || !preview ? (
          <div style={{ padding: '36px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: 'var(--arvo-black)', fontWeight: 600, margin: 0 }}>{r.notFound}</p>
            <Link to="/" style={{ fontSize: 13, color: 'var(--arvo-fg-soft)' }}>{r.backToApp}</Link>
          </div>
        ) : (
          <>
            {preview.preview_image_url && (
              <img src={preview.preview_image_url} alt="" style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }} />
            )}

            <div style={{ padding: '28px 28px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }}>
                  {preview.visibility === 'paid' ? r.members : r.free}
                </span>
                <h1 style={{ fontFamily: 'var(--arvo-font-display, var(--arvo-font-body))', fontSize: 22, color: 'var(--arvo-black)', margin: '6px 0 0', lineHeight: 1.25 }}>
                  {preview.title}
                </h1>
              </div>

              {preview.description && (
                <p style={{ fontSize: 14, color: 'var(--arvo-fg-soft)', lineHeight: 1.6, margin: 0 }}>{preview.description}</p>
              )}

              {error && <p style={{ fontSize: 13, color: '#D63B2F', margin: 0 }}>{error}</p>}

              {result ? (
                /* ── Liberado ── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {result.type === 'content' ? (
                    <div>
                      <p style={{ fontSize: 12, color: 'var(--arvo-green, #1F8A5B)', fontWeight: 600, margin: '0 0 10px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{r.contentUnlocked}</p>
                      <div style={{ fontSize: 14, color: 'var(--arvo-black)', lineHeight: 1.65, whiteSpace: 'pre-wrap', maxHeight: 420, overflowY: 'auto', padding: '14px 16px', background: 'var(--arvo-offwhite)', borderRadius: 8, border: '1px solid var(--arvo-border)' }}>
                        {result.content_md}
                      </div>
                    </div>
                  ) : result.type === 'link' ? (
                    <a href={result.external_url} target="_blank" rel="noopener noreferrer" style={{ ...btnPrimary, display: 'block', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}>
                      {r.openLink}
                    </a>
                  ) : (
                    <>
                      <p style={{ fontSize: 13, color: 'var(--arvo-green, #1F8A5B)', margin: 0 }}>{r.downloadStarted}</p>
                      <a href={result.download_url} style={{ ...btnPrimary, display: 'block', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}>
                        {r.downloadAgain}
                      </a>
                    </>
                  )}
                  <Link to="/recursos" style={{ fontSize: 12, color: 'var(--arvo-fg-soft)', textAlign: 'center' }}>{r.exploreMore}</Link>
                </div>
              ) : preview.visibility === 'paid' ? (
                <p style={{ fontSize: 13, color: 'var(--arvo-fg-soft)', margin: 0 }}>{r.membersSoon}</p>
              ) : user ? (
                /* ── Logado: libera direto ── */
                <button onClick={handleUnlock} disabled={unlocking} style={{ ...btnPrimary, opacity: unlocking ? 0.6 : 1 }}>
                  {unlocking ? r.unlocking : r.unlockCta}
                </button>
              ) : (
                /* ── Gate de cadastro ── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '18px 18px 16px', background: 'var(--arvo-offwhite)', borderRadius: 10, border: '1px solid var(--arvo-border)' }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--arvo-black)', margin: 0 }}>{r.gateTitle}</p>
                  <p style={{ fontSize: 13, color: 'var(--arvo-fg-soft)', lineHeight: 1.55, margin: 0 }}>{r.gateText}</p>
                  <button onClick={() => goToLogin('register')} style={{ ...btnPrimary, marginTop: 4 }}>{r.createAccount}</button>
                  <button onClick={() => goToLogin('login')} style={btnGhost}>{r.haveAccount}</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
