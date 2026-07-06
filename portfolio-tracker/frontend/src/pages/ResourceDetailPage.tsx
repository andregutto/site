import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useI18n } from '../contexts/I18nContext'
import { apiFetch } from '../lib/api'
import { PageLoader } from '../components/ArvoLoader'

// Página de um Recurso pra quem JÁ ESTÁ LOGADO — dentro do AppLayout (mesmo
// header/nav do resto do app). Layout espelha a referência real que o André
// mandou (epic.new/.../resources/:id): breadcrumb > título > tag > imagem
// contida num card (sem texto por cima) > card de link/ação com botão
// pequeno > "Sobre este recurso". Diferente da ResourcePublicPage (fora do
// AppLayout, só pro gate de cadastro) — ver o roteamento condicional em
// App.tsx: só uma das duas existe na árvore de rotas por vez, dependendo
// de `user`.

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

function TypeIcon({ type }: { type: ResourceDetail['resource_type'] }) {
  if (type === 'file') return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 1.5h6.5L13 5v9.5H3zM9 1.5V5h4"/>
      <path strokeLinecap="round" d="M8 7.5v4M6 9.7l2 1.8 2-1.8"/>
    </svg>
  )
  if (type === 'link') return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 9.5l3-3M7.5 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M8.5 11.5l-1 1a2.5 2.5 0 01-3.5-3.5l1-1"/>
    </svg>
  )
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 2.5h11v11h-11zM5 5.5h6M5 8h6M5 10.5h4"/>
    </svg>
  )
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

  const card: React.CSSProperties = { background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 14 }
  const btnSmall: React.CSSProperties = {
    padding: '9px 20px', background: 'var(--arvo-black)', color: 'var(--arvo-offwhite, #F6F3EC)',
    fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, letterSpacing: '0.08em', whiteSpace: 'nowrap',
    border: 'none', borderRadius: 8, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  }

  const actionLabel = unlocking ? r.unlocking : resource.resource_type === 'file' ? r.download : resource.resource_type === 'link' ? r.open : r.view

  return (
    <div className="py-6 space-y-5" style={{ maxWidth: 720 }}>
      <button
        onClick={() => navigate('/recursos')}
        style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', padding: 0 }}
      >
        {r.title} <span style={{ opacity: 0.5 }}>/</span> <span style={{ color: 'var(--arvo-fg)' }}>{resource.title}</span>
      </button>

      <div>
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 400, fontSize: 'clamp(26px, 3.2vw, 34px)', color: 'var(--arvo-fg)', margin: 0, lineHeight: 1.2 }}>
          {resource.title}
        </h1>
      </div>

      <span style={{
        display: 'inline-block', fontFamily: 'var(--arvo-font-body)', fontSize: 10.5, letterSpacing: '0.10em', textTransform: 'uppercase',
        color: 'var(--arvo-gold-text, #8C6A28)', background: 'var(--arvo-beige, #F1EDE5)', padding: '4px 12px', borderRadius: 999,
      }}>
        {resource.visibility === 'paid' ? r.members : r.free}
      </span>

      {resource.preview_image_url && (
        // Imagem contida num card, sem overlay de texto por cima — a
        // referência (epic.new) mostra ela como um bloco próprio, não como
        // fundo de hero. maxHeight generoso evita esticar além do que a
        // imagem original suporta bem.
        <div style={{ ...card, overflow: 'hidden' }}>
          <img
            src={resource.preview_image_url}
            alt={resource.title}
            style={{ width: '100%', maxHeight: 360, objectFit: 'cover', objectPosition: resource.cover_image_position ?? '50% 50%', display: 'block' }}
          />
        </div>
      )}

      {/* Card de ação — ícone + tipo à esquerda, botão pequeno à direita, igual à referência */}
      <div style={{ ...card, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--arvo-beige, #F1EDE5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--arvo-gold-text, #8C6A28)', flexShrink: 0 }}>
          <TypeIcon type={resource.resource_type} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, fontWeight: 600, color: 'var(--arvo-fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {resource.title}
          </p>
          {unlockError && <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-red)', margin: '2px 0 0' }}>{unlockError}</p>}
        </div>

        {result ? (
          result.type === 'link' ? (
            // Link real (não window.open após await) — evita o bloqueio de popup
            <a href={result.external_url} target="_blank" rel="noopener noreferrer" style={btnSmall}>{r.openLink}</a>
          ) : result.type === 'file' ? (
            <a href={result.download_url} style={btnSmall}>{r.downloadAgain}</a>
          ) : (
            <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-green, #1F8A5B)' }}>{r.contentUnlocked}</span>
          )
        ) : resource.visibility === 'paid' ? (
          <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)' }}>{r.membersSoon}</span>
        ) : (
          <button onClick={handleUnlock} disabled={unlocking} style={{ ...btnSmall, opacity: unlocking ? 0.6 : 1 }}>{actionLabel}</button>
        )}
      </div>

      {result?.type === 'content' && (
        <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg)', lineHeight: 1.65, whiteSpace: 'pre-wrap', maxHeight: 420, overflowY: 'auto', padding: '18px 20px', ...card }}>
          {result.content_md}
        </div>
      )}

      {resource.description && (
        <div>
          <h2 style={{ fontFamily: 'var(--arvo-font-display, var(--arvo-font-body))', fontSize: 17, color: 'var(--arvo-fg)', margin: '0 0 8px' }}>{r.aboutTitle}</h2>
          <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14.5, color: 'var(--arvo-fg-soft)', lineHeight: 1.65, margin: 0 }}>
            {resource.description}
          </p>
        </div>
      )}
    </div>
  )
}
