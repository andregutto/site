import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useI18n } from '../contexts/I18nContext'
import { apiFetch } from '../lib/api'
import { PageLoader } from '../components/ArvoLoader'

// Página de um Recurso pra quem JÁ ESTÁ LOGADO — dentro do AppLayout (mesmo
// header/nav do resto do app), no mesmo padrão de VoyageTripDetailPage
// (hero em faixa com rounded-2xl, não em tela cheia). Diferente da
// ResourcePublicPage (fora do AppLayout, só pro gate de cadastro de quem
// ainda não tem conta) — ver o roteamento condicional em App.tsx: só uma
// das duas existe na árvore de rotas por vez, dependendo de `user`.

interface ResourceDetail {
  slug: string
  title: string
  description: string | null
  resource_type: 'file' | 'link' | 'content'
  preview_image_url: string | null
  cover_image_position: string | null
  visibility: 'free' | 'paid'
  unlocked: boolean
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

export default function ResourceDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { t } = useI18n()
  const r = t.resources

  const [resource, setResource] = useState<ResourceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const [result, setResult] = useState<UnlockResult | null>(null)
  const [unlockError, setUnlockError] = useState('')

  useEffect(() => {
    if (!slug) return
    apiFetch<ResourceDetail>(`/resources/${slug}`)
      .then(setResource)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [slug])

  async function handleUnlock() {
    if (unlocking) return
    setUnlocking(true)
    setUnlockError('')
    try {
      const res = await apiFetch<UnlockResult>(`/resources/${slug}/unlock`, {
        method: 'POST',
        body: JSON.stringify(getStoredUtm()),
      })
      setResult(res)
      setResource(prev => prev ? { ...prev, unlocked: true } : prev)
      if (res.type === 'file' && res.download_url) window.location.assign(res.download_url)
    } catch (ex: unknown) {
      setUnlockError((ex as Error).message)
    } finally {
      setUnlocking(false)
    }
  }

  // Voltou logado do Google (veio direto pra esta URL, ver AuthContext.signInWithGoogle
  // e o handleGoogle da ResourcePublicPage) → libera sozinho.
  useEffect(() => {
    if (!resource || resource.visibility !== 'free') return
    const pending = sessionStorage.getItem('pending_resource_slug')
    if (pending && pending === slug) {
      sessionStorage.removeItem('pending_resource_slug')
      handleUnlock()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource])

  if (loading) return <PageLoader />

  if (notFound || !resource) {
    return (
      <div className="py-6" style={{ textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, fontWeight: 600, color: 'var(--arvo-fg)' }}>{r.notFound}</p>
        <button onClick={() => navigate('/recursos')} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)', background: 'none', border: 'none', cursor: 'pointer' }}>
          ← {r.title}
        </button>
      </div>
    )
  }

  const btnPrimary: React.CSSProperties = {
    width: '100%', padding: '13px 24px', background: 'var(--arvo-black)', color: 'var(--arvo-offwhite, #F6F3EC)',
    fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
    border: 'none', borderRadius: 6, cursor: 'pointer', boxSizing: 'border-box' as const,
  }
  const card: React.CSSProperties = { background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 16 }

  return (
    <div className="py-6">
      <button
        onClick={() => navigate('/recursos')}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', padding: 0, marginBottom: 20 }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" d="M9 2L4 7l5 5" />
        </svg>
        {r.title}
      </button>

      {/* Hero — faixa (mesmo padrão de VoyageTripDetailPage), não tela cheia */}
      <div className="h-52 sm:h-48 lg:h-44" style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', marginBottom: 24, background: 'var(--arvo-black)' }}>
        {resource.preview_image_url ? (
          <img
            src={resource.preview_image_url}
            alt={resource.title}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: resource.cover_image_position ?? '50% 50%' }}
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src="/brand/logo/arvo-symbol-gold.svg" width="36" height="38" alt="" />
          </div>
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(13,13,13,0.75) 0%, rgba(13,13,13,0.10) 55%, transparent 100%)' }} />
        <div style={{ position: 'absolute', bottom: 16, left: 20, right: 20 }}>
          <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10, letterSpacing: '0.20em', textTransform: 'uppercase', color: 'var(--arvo-gold)' }}>
            {resource.visibility === 'paid' ? r.members : r.free}
          </span>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 400, fontSize: 'clamp(22px, 3vw, 30px)', color: '#FFFFFF', margin: '4px 0 0', lineHeight: 1.2 }}>
            {resource.title}
          </h1>
        </div>
      </div>

      <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {resource.description && (
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 15, color: 'var(--arvo-fg-soft)', lineHeight: 1.65, margin: 0 }}>
            {resource.description}
          </p>
        )}

        <div style={{ ...card, padding: '22px 24px' }}>
          {unlockError && <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-red)', margin: '0 0 14px' }}>{unlockError}</p>}

          {result ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {result.type === 'content' ? (
                <div>
                  <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-green, #1F8A5B)', fontWeight: 600, margin: '0 0 10px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{r.contentUnlocked}</p>
                  <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg)', lineHeight: 1.65, whiteSpace: 'pre-wrap', maxHeight: 420, overflowY: 'auto', padding: '16px 18px', background: 'var(--arvo-bg, var(--arvo-offwhite))', borderRadius: 10, border: '1px solid var(--arvo-border-soft, var(--arvo-border))' }}>
                    {result.content_md}
                  </div>
                </div>
              ) : result.type === 'link' ? (
                // Link real (não window.open após await) — evita o bloqueio de popup
                <a href={result.external_url} target="_blank" rel="noopener noreferrer" style={{ ...btnPrimary, display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                  {r.openLink}
                </a>
              ) : (
                <>
                  <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-green, #1F8A5B)', margin: 0 }}>{r.downloadStarted}</p>
                  <a href={result.download_url} style={{ ...btnPrimary, display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                    {r.downloadAgain}
                  </a>
                </>
              )}
            </div>
          ) : resource.visibility === 'paid' ? (
            <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, color: 'var(--arvo-fg-soft)', margin: 0 }}>{r.membersSoon}</p>
          ) : (
            <button onClick={handleUnlock} disabled={unlocking} style={{ ...btnPrimary, opacity: unlocking ? 0.6 : 1 }}>
              {unlocking ? r.unlocking : r.unlockCta}
            </button>
          )}
        </div>

        <Link to="/recursos" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg-soft)' }}>{r.exploreMore}</Link>
      </div>
    </div>
  )
}
