import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import { PageLoader } from '../../components/ArvoLoader'
import PullToRefresh from '../../components/PullToRefresh'
import TripCard from '../voyage/_shared/TripCard'
import { tripCountries, tripDurationLabel } from './_shared/tripHelpers'
import type { CommunityTripCard } from './types'

const OCRE = '#E8A020'

// Galeria de viagens da Comunidade — viagens que os donos disponibilizaram
// via o toggle "Disponibilizar pra comunidade" do modal Compartilhar do
// Voyage. Mesmo card visual da página Viagens (TripCard compartilhado), com
// dono no rodapé e filtro simples por país (sem agrupamento adaptativo —
// decisão tomada: fica pra quando houver volume). Card → /voyage/shared/:id.
export default function CommunityTripsPage() {
  const { t } = useI18n()
  const tc = (t as any).community
  const tt = tc?.trips ?? {}
  const navigate = useNavigate()
  const [trips, setTrips] = useState<CommunityTripCard[] | null>(null)
  const [countryFilter, setCountryFilter] = useState<string | null>(null)

  async function load() {
    const res = await apiFetch<{ trips: CommunityTripCard[] }>('/community/trips')
    setTrips(res.trips)
  }

  useEffect(() => { load().catch(() => setTrips([])) }, [])

  const countries = useMemo(() => {
    const set = new Set<string>()
    for (const trip of trips ?? []) for (const c of tripCountries(trip)) set.add(c)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [trips])

  if (!trips) return <PageLoader />

  const visible = countryFilter ? trips.filter(trip => tripCountries(trip).includes(countryFilter)) : trips

  return (
    <PullToRefresh onRefresh={load}>
    <div className="space-y-5">
      <Link to="/community" style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg-soft)', textDecoration: 'none' }}>
        ← {tc?.backToCommunity ?? 'Voltar para a comunidade'}
      </Link>

      <div>
        <div className="flex items-center gap-2">
          {/* Globo — o avião de papel é o ícone de mensagens, não cabe aqui */}
          <span style={{ color: OCRE, display: 'inline-flex' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" d="M3 12h18M12 3c2.5 2.4 3.9 5.6 3.9 9s-1.4 6.6-3.9 9c-2.5-2.4-3.9-5.6-3.9-9S9.5 5.4 12 3z" />
            </svg>
          </span>
          <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 24, color: 'var(--arvo-fg)' }}>
            {tt.title ?? 'Viagens'}
          </h1>
        </div>
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg-muted)', marginTop: 4 }}>
          {tt.subtitle ?? 'Roteiros que membros da comunidade compartilharam'}
        </p>
      </div>

      {/* Chips de filtro por país — só aparecem quando há mais de um país */}
      {countries.length > 1 && (
        <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {[null, ...countries].map(c => (
            <button
              key={c ?? '__all'}
              type="button"
              onClick={() => setCountryFilter(c)}
              style={{
                fontFamily: 'var(--arvo-font-body)', fontSize: 13, padding: '5px 14px', borderRadius: 999,
                border: `1px solid ${countryFilter === c ? OCRE : 'var(--arvo-border)'}`,
                color: countryFilter === c ? OCRE : 'var(--arvo-fg-muted)',
                background: countryFilter === c ? 'rgba(232,160,32,0.08)' : 'transparent',
                cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 160ms ease',
              }}
            >
              {c ?? (tt.allCountries ?? 'Todos')}
            </button>
          ))}
        </div>
      )}

      {trips.length === 0 ? (
        <div className="flex flex-col items-center justify-center" style={{ minHeight: 300, gap: 14 }}>
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none" stroke="rgba(232,160,32,0.35)" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 38l12-24 16 12 12-20 12 10"/>
            <path strokeLinecap="round" d="M4 50h48"/>
            <circle cx="28" cy="16" r="4" strokeWidth="1.2"/>
          </svg>
          <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 20, letterSpacing: '0.06em', color: 'var(--arvo-fg-muted)', textAlign: 'center' }}>
            {tt.emptyTitle ?? 'Nenhuma viagem compartilhada ainda'}
          </p>
          <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--arvo-gold)', textAlign: 'center', maxWidth: 420 }}>
            {tt.emptyBody ?? 'Seja a primeira pessoa: abra uma viagem no Voyage e ative "Disponibilizar pra comunidade" no modal Compartilhar.'}
          </p>
        </div>
      ) : visible.length === 0 ? (
        <p style={{ fontFamily: 'var(--arvo-font-serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--arvo-gold)', textAlign: 'center', padding: '48px 0' }}>
          {tt.emptyFilter ?? 'Nenhuma viagem neste país'}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {visible.map((trip, i) => (
            <div key={trip.id} style={{ animation: 'fadeUp 320ms cubic-bezier(0.22,0.61,0.36,1) both', animationDelay: `${i * 40}ms` }}>
              <TripCard
                trip={trip}
                t={t}
                showCost={false}
                durationLabel={tripDurationLabel(trip, tc)}
                owner={trip.owner}
                onOwnerClick={() => navigate(`/u/${trip.owner.username ?? trip.owner.id}`)}
                onClick={() => navigate(`/voyage/shared/${trip.id}`)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
    </PullToRefresh>
  )
}
