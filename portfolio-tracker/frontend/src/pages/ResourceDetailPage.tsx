import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useI18n } from '../contexts/I18nContext'
import { apiFetch } from '../lib/api'
import { PageLoader } from '../components/ArvoLoader'
import { linkifyText } from './community/_shared/linkify'

// Página de um Recurso pra quem JÁ ESTÁ LOGADO — dentro do AppLayout (mesmo
// header/nav do resto do app). Layout espelha a referência real que o André
// mandou (epic.new/.../resources/:id): título serif centralizado acima do
// card > imagem autoral com gradiente na base fundindo na superfície > card
// de ação com o destino visível (nome do arquivo ou URL) + botão pill >
// "Sobre este recurso". O gate é o login: o GET já devolve o conteúdo pronto
// (sem clique de "Liberar" — ver resources.ts no shared-api); o evento de
// unlock/atribuição é registrado server-side na primeira abertura.
// Diferente da ResourcePublicPage (fora do AppLayout, só pro gate de
// cadastro) — ver o roteamento condicional em App.tsx: só uma das duas
// existe na árvore de rotas por vez, dependendo de `user`.

interface ResourceContent {
  type: 'file' | 'link' | 'content'
  download_url?: string
  external_url?: string
  content_md?: string
  file_name?: string
}

interface ResourceDetail {
  slug: string
  title: string
  description: string | null
  resource_type: 'file' | 'link' | 'content'
  preview_image_url: string | null
  cover_image_position: string | null
  visibility: 'free' | 'plus' | 'beta'
  unlocked: boolean
  content?: ResourceContent | null
}

// Quem já tem conta nunca passa pela ResourcePublicPage (é ela quem grava
// sessionStorage['resource_utm'], só rodada pra usuário deslogado — ver
// roteamento condicional em App.tsx). Sem isso, todo clique de um usuário já
// logado num link com UTM perdia a atribuição. Por isso lê a URL desta
// própria página primeiro; sessionStorage só sobra como fallback do fluxo
// pós-redirect do Google (ver AuthContext.bootstrapSignupSource).
function getStoredUtm(): Record<string, string> {
  const params = new URLSearchParams(window.location.search)
  const fromUrl: Record<string, string> = {}
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
    const v = params.get(k)
    if (v) fromUrl[k] = v
  }
  if (Object.keys(fromUrl).length) return fromUrl
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

  useEffect(() => {
    if (!slug) return
    // pending_resource_slug era o retomar-unlock do fluxo pós-Google; com o
    // conteúdo vindo direto no GET ele só precisa ser limpo.
    if (sessionStorage.getItem('pending_resource_slug') === slug) sessionStorage.removeItem('pending_resource_slug')
    const utm = new URLSearchParams(getStoredUtm()).toString()
    apiFetch<ResourceDetail>(`/resources/${slug}${utm ? `?${utm}` : ''}`)
      .then(setResource)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [slug])

  if (loading) return <PageLoader />

  if (notFound || !resource) {
    return (
      <div className="py-6" style={{ textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, fontWeight: 600, color: 'var(--arvo-fg)' }}>{r.notFound}</p>
        <button onClick={() => navigate('/resources')} style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg-soft)', background: 'none', border: 'none', cursor: 'pointer' }}>
          ← {r.title}
        </button>
      </div>
    )
  }

  const content = resource.content ?? null
  const tierLabel = resource.visibility === 'free' ? r.free : resource.visibility === 'plus' ? r.plus : r.beta
  // O destino visível no card de ação (padrão da referência): nome do
  // arquivo pro tipo file, URL completa pro tipo link, título pro texto.
  const targetLabel = content?.type === 'file' ? (content.file_name ?? resource.title)
    : content?.type === 'link' ? (content.external_url ?? resource.title)
    : resource.title

  const btnPill: React.CSSProperties = {
    padding: '10px 22px', background: 'var(--arvo-black)', color: 'var(--arvo-offwhite, #F6F3EC)',
    fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, letterSpacing: '0.08em', whiteSpace: 'nowrap',
    border: 'none', borderRadius: 999, cursor: 'pointer', textDecoration: 'none',
    display: 'inline-flex', alignItems: 'center', gap: 7, justifyContent: 'center',
  }
  const extIcon = (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 13, height: 13 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 3.5H3.5v9h9V9.5M9.5 3h3.5v3.5M12.5 3.5L7.5 8.5"/>
    </svg>
  )

  return (
    <div className="py-6 space-y-5" style={{ maxWidth: 680, margin: '0 auto' }}>
      <button
        onClick={() => navigate('/resources')}
        style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)', padding: 0 }}
      >
        {r.title} <span style={{ opacity: 0.5 }}>/</span> <span style={{ color: 'var(--arvo-fg)' }}>{resource.title}</span>
      </button>

      <div style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', borderRadius: 16, overflow: 'hidden' }}>
        {/* Imagem autoral com gradiente na base fundindo na superfície do
            card — a foto "escorre" pro painel de ação, sem borda seca. */}
        <div style={{ position: 'relative', height: resource.preview_image_url ? 230 : 140 }}>
          <img
            src={resource.preview_image_url || '/brand/imagery/arvo-fallback-recurso.jpg'}
            alt={resource.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: resource.preview_image_url ? (resource.cover_image_position ?? '50% 50%') : '50% 30%', display: 'block' }}
          />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 55%, var(--arvo-surface) 100%)', pointerEvents: 'none' }} />
        </div>

        <div style={{ padding: '4px 24px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Título embaixo da imagem (preferência do André sobre o título
              centralizado acima do card da referência Epic) */}
          <div>
            <span style={{
              display: 'inline-block', fontFamily: 'var(--arvo-font-body)', fontSize: 10.5, letterSpacing: '0.10em', textTransform: 'uppercase',
              color: 'var(--arvo-gold-text, #8C6A28)', background: 'var(--arvo-beige, #F1EDE5)', padding: '4px 12px', borderRadius: 999, marginBottom: 10,
            }}>
              {tierLabel}
            </span>
            <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 400, fontSize: 'clamp(22px, 2.8vw, 28px)', color: 'var(--arvo-fg)', margin: 0, lineHeight: 1.2 }}>
              {resource.title}
            </h1>
          </div>

          {/* Card de ação: ícone do tipo + destino visível + botão pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <div style={{ width: 42, height: 42, borderRadius: 11, background: 'var(--arvo-beige, #F1EDE5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--arvo-gold-text, #8C6A28)', flexShrink: 0 }}>
              <TypeIcon type={resource.resource_type} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14.5, fontWeight: 600, color: 'var(--arvo-fg)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {resource.title}
              </p>
              <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12.5, color: 'var(--arvo-fg-soft)', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {resource.unlocked ? targetLabel : tierLabel}
              </p>
            </div>
            <div style={{ flexShrink: 0 }}>
              {content?.type === 'link' ? (
                <a href={content.external_url} target="_blank" rel="noopener noreferrer" style={btnPill}>{extIcon}{r.open}</a>
              ) : content?.type === 'file' ? (
                <a href={content.download_url} style={btnPill}>{r.download}</a>
              ) : content?.type === 'content' ? null : (
                <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)' }}>{r.membersSoon}</span>
              )}
            </div>
          </div>

          {content?.type === 'content' && (
            <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg)', lineHeight: 1.65, whiteSpace: 'pre-wrap', padding: '16px 18px', background: 'var(--arvo-bg, var(--arvo-offwhite))', borderRadius: 12, border: '1px solid var(--arvo-border-soft, var(--arvo-border))' }}>
              {linkifyText(content.content_md ?? '')}
            </div>
          )}

          {resource.description && (
            <div style={{ borderTop: '1px solid var(--arvo-border-soft, var(--arvo-border))', paddingTop: 14 }}>
              <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 400, fontSize: 20, color: 'var(--arvo-fg)', margin: '0 0 8px' }}>{r.aboutTitle}</h2>
              <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg-soft)', lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap' }}>
                {resource.description}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
