import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useI18n } from '../../contexts/I18nContext'
import { apiFetch } from '../../lib/api'
import { PageLoader } from '../../components/ArvoLoader'
import { TripShareView, type PageData } from './PublicTripPage'

// Visão logada da viagem compartilhada (/voyage/shared/:tripId) — a
// recompensa do gate de cadastro (SharedTripGatePage, mesma URL deslogado).
// Renderiza dentro do AppLayout o mesmo miolo da página pública por token
// (TripShareView), alimentado por GET /voyage/shared/:tripId, que exige
// login e devolve o payload do mesmo builder do endpoint público.

export default function SharedTripViewPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const { t } = useI18n()
  const tv = (t as any).voyage ?? {}

  const [data, setData] = useState<(PageData & { share_token?: string | null }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!tripId) return
    // O gate já cumpriu o papel dele — não deixar a chave pendente
    // redirecionar futuros logins de volta pra cá.
    if (sessionStorage.getItem('pending_trip_gate') === tripId) sessionStorage.removeItem('pending_trip_gate')
    apiFetch<PageData & { share_token?: string | null }>(`/voyage/shared/${tripId}`)
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : (tv.public?.loadError ?? 'Erro ao carregar')))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId])

  if (loading) return <PageLoader />

  if (error || !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '64px 16px' }}>
        <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 16, letterSpacing: '0.06em', color: 'var(--arvo-fg-muted)' }}>
          {tv.public?.notFound ?? 'Página não encontrada'}
        </p>
        <Link to="/voyage" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: '#D63B2F', textDecoration: 'none' }}>
          Arvo Voyage →
        </Link>
      </div>
    )
  }

  return (
    <TripShareView
      data={data}
      kmlUrl={data.share_token ? `/api/voyage/public/${data.share_token}/kml` : null}
      embedded
    />
  )
}
