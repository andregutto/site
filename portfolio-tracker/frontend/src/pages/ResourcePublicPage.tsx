import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useI18n } from '../contexts/I18nContext'
import ArvoLoader from '../components/ArvoLoader'
import GateAuthPanel, { GateShell } from '../components/GateAuthPanel'

// Página pública de um Recurso (/resources/:slug) — SÓ pro visitante deslogado
// (App.tsx só monta esta rota quando !user; assim que a sessão existe, a
// mesma URL passa a renderizar ResourceDetailPage dentro do AppLayout — ver
// o roteamento condicional em App.tsx). É o destino dos lead magnets dos
// vídeos do canal. O fundo em tela cheia e o painel de cadastro/login à
// esquerda vivem em components/GateAuthPanel (compartilhados com o gate de
// viagem, SharedTripGatePage); aqui fica só o card de preview do recurso.
// Depois de autenticado (login por senha, ou volta do Google/confirmação de
// e-mail), o React Router troca sozinho pra ResourceDetailPage — o unlock em
// si (e o auto-unlock via pending_resource_slug) vive lá, não aqui.

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

export default function ResourcePublicPage() {
  const { slug } = useParams<{ slug: string }>()
  const { t } = useI18n()
  const r = t.resources

  const [preview, setPreview] = useState<ResourcePreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(true)
  const [notFound, setNotFound] = useState(false)

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

  if (loadingPreview) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--arvo-black)' }}>
        <ArvoLoader size={40} style={{ color: 'var(--arvo-gold)' }} />
      </div>
    )
  }

  if (notFound || !preview) {
    return (
      <GateShell grid={false}>
        <div style={{ textAlign: 'center', background: '#FFFFFF', borderRadius: 12, padding: '36px 28px' }}>
          <p style={{ fontFamily: F_SANS, fontSize: 14, fontWeight: 600, color: 'var(--arvo-black)', margin: 0 }}>{r.notFound}</p>
          <Link to="/" style={{ fontFamily: F_SANS, fontSize: 14, color: 'var(--arvo-fg-soft)' }}>{r.backToApp}</Link>
        </div>
      </GateShell>
    )
  }

  return (
    <GateShell>
      <GateAuthPanel eyebrow={r.gateEyebrow} googleRedirectPath={`/resources/${slug}`} loginSubmitLabel={r.unlockCta} />

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
            <p style={{ fontFamily: F_SANS, fontSize: 14, color: 'rgba(242,237,228,0.6)', margin: '0 0 0 0', marginTop: 'auto' }}>{r.membersSoon}</p>
          ) : (
            <p style={{ fontFamily: F_SANS, fontSize: 13.5, color: 'rgba(242,237,228,0.5)', letterSpacing: '0.04em', margin: 0, marginTop: 'auto' }}>
              {r.unlockHint}
            </p>
          )}
        </div>
      </div>
    </GateShell>
  )
}
