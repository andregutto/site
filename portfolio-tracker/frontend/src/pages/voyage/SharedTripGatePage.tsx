import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useI18n } from '../../contexts/I18nContext'
import ArvoLoader from '../../components/ArvoLoader'
import GateAuthPanel, { GateShell } from '../../components/GateAuthPanel'
import { fmtDateRange, destinationsLabel, tripDurationDays } from './PublicTripPage'

// Gate de cadastro de uma viagem compartilhada (/voyage/shared/:tripId) — SÓ
// pro visitante deslogado (App.tsx só monta esta rota quando !user; com a
// sessão pronta, a mesma URL renderiza SharedTripViewPage dentro do
// AppLayout). É a frente B dos lead magnets do canal: o vídeo aponta pra cá,
// o visitante vê o card da viagem (capa, título, destino, teaser "12 lugares
// · 8 dias" — sem entregar o roteiro) e cria a conta pra liberar. Mesmo
// padrão visual e de atribuição do gate de Recursos (ResourcePublicPage).

const F_SANS    = 'var(--arvo-font-body)'
const F_DISPLAY = "'Playfair Display', Georgia, serif"

interface GatePreview {
  title: string
  destination: string | null
  country: string | null
  cover_image_url: string | null
  cover_image_position: string
  start_date: string | null
  end_date: string | null
  summary: string | null
  owner_name: string
  place_count: number
  destinations: { city: string | null; country: string | null }[]
}

function intlLocaleFor(locale: string) {
  return locale === 'pt' ? 'pt-BR' : locale === 'fr' ? 'fr-FR' : 'en-US'
}

export default function SharedTripGatePage() {
  const { tripId } = useParams<{ tripId: string }>()
  const { t, locale } = useI18n()
  const tv = (t as any).voyage ?? {}
  const tg = tv.gate ?? {}

  const [preview, setPreview] = useState<GatePreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!tripId) return
    const params = new URLSearchParams(window.location.search)
    const utm: Record<string, string> = {}
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
      const v = params.get(key)
      if (v) utm[key] = v
    }
    // Só a atribuição do cadastro conta hoje (profiles.signup_source); o utm
    // fica guardado no mesmo padrão do gate de recursos ('resource_utm') pra
    // quando existir um evento pós-login que o consuma.
    if (Object.keys(utm).length) sessionStorage.setItem('trip_utm', JSON.stringify(utm))
    sessionStorage.setItem('signup_source', `trip:${tripId}`)
    // Retomar a mesma URL depois de um login que passe pelo /login (ex:
    // volta da confirmação de e-mail) — ver o redirect em App.tsx.
    sessionStorage.setItem('pending_trip_gate', tripId)

    fetch(`/api/voyage/gate/${tripId}${window.location.search}`)
      .then(async res => {
        if (!res.ok) { setNotFound(true); return }
        setPreview(await res.json())
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoadingPreview(false))
  }, [tripId])

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
          <p style={{ fontFamily: F_SANS, fontSize: 14, fontWeight: 600, color: 'var(--arvo-black)', margin: 0 }}>
            {tv.public?.notFound ?? 'Página não encontrada'}
          </p>
          <Link to="/" style={{ fontFamily: F_SANS, fontSize: 14, color: 'var(--arvo-fg-soft)' }}>
            {tv.public?.discoverArvo ?? 'Conheça o Arvo →'}
          </Link>
        </div>
      </GateShell>
    )
  }

  const intlLocale = intlLocaleFor(locale)
  const dateStr = fmtDateRange(preview.start_date, preview.end_date, intlLocale, tv)
  const destLabel = preview.destinations.length > 0
    ? destinationsLabel(preview.destinations, 3)
    : preview.destination ? `${preview.destination}${preview.country ? `, ${preview.country}` : ''}` : null
  const dayCount = tripDurationDays(preview.start_date, preview.end_date)

  // Teaser quantitativo — mostra o tamanho do roteiro sem entregar o roteiro.
  const teaser = [
    preview.place_count > 0
      ? (preview.place_count === 1 ? (tg.placesOne ?? '1 lugar') : (tg.placesMany ?? '{n} lugares').replace('{n}', String(preview.place_count)))
      : null,
    dayCount != null
      ? (dayCount === 1 ? (tg.daysOne ?? '1 dia') : (tg.daysMany ?? '{n} dias').replace('{n}', String(dayCount)))
      : null,
  ].filter(Boolean).join(' · ')

  return (
    <GateShell>
      <GateAuthPanel eyebrow={tg.eyebrow ?? 'Acesso ao roteiro'} googleRedirectPath={`/voyage/shared/${tripId}`} />

      {/* ── Right: card da viagem — mesmo formato do card de recurso ── */}
      <div style={{
        background: 'rgba(20,18,15,0.55)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, overflow: 'hidden',
        display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
      }}>
        <div style={{ height: 180, flexShrink: 0 }}>
          {preview.cover_image_url ? (
            <img
              src={preview.cover_image_url}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: preview.cover_image_position || '50% 50%', display: 'block' }}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #1a1a18 0%, #2a2820 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none" stroke="rgba(200,184,154,0.18)" strokeWidth="1.3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 38l12-24 16 12 12-20 12 10"/>
                <path strokeLinecap="round" d="M4 50h48"/>
              </svg>
            </div>
          )}
        </div>

        <div style={{ padding: '28px 28px', display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
          <div>
            <span style={{ fontFamily: F_SANS, fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'var(--arvo-gold)' }}>
              {(() => {
                const [pre, post] = (tv.public?.ownerItinerary ?? 'Roteiro de {name}').split('{name}')
                return `${pre}${preview.owner_name}${post ?? ''}`
              })()}
            </span>
            <h1 style={{ fontFamily: F_DISPLAY, fontWeight: 400, fontSize: 'clamp(22px, 2.6vw, 28px)', color: 'var(--arvo-offwhite, #F6F3EC)', margin: '8px 0 0', lineHeight: 1.2 }}>
              {preview.title}
            </h1>
            {(destLabel || dateStr) && (
              <p style={{ fontFamily: F_SANS, fontSize: 13.5, color: 'rgba(242,237,228,0.65)', margin: '8px 0 0' }}>
                {[destLabel, dateStr].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          {preview.summary && (
            <p style={{ fontFamily: F_SANS, fontSize: 14, color: 'rgba(242,237,228,0.75)', lineHeight: 1.6, margin: 0 }}>
              {preview.summary}
            </p>
          )}

          {teaser && (
            <p style={{ fontFamily: F_SANS, fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--arvo-gold)', margin: 0 }}>
              {teaser}
            </p>
          )}

          <p style={{ fontFamily: F_SANS, fontSize: 13.5, color: 'rgba(242,237,228,0.5)', letterSpacing: '0.04em', margin: 0, marginTop: 'auto' }}>
            {tg.unlockHint ?? 'Faça login ou crie sua conta grátis ao lado para ver o roteiro completo, com mapa e todos os lugares.'}
          </p>
        </div>
      </div>
    </GateShell>
  )
}
