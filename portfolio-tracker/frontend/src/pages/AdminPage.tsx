import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { useI18n } from '../contexts/I18nContext'
import { PageLoader } from '../components/ArvoLoader'
import CommunityAdminPage from './community/CommunityAdminPage'
import ResourcesAdminPage from './ResourcesAdminPage'
import AcquisitionAdminPage from './AcquisitionAdminPage'
import PlansAdminPage from './PlansAdminPage'

// Admin consolidado: um único ponto de entrada (menu do avatar → "Administração",
// só visível pra quem é community_admin) em vez de dois espalhados (antigo
// /community/admin e /resources/admin). Ambos compartilham a mesma tabela
// community_admins (ver isAdmin() em community.ts e resources.ts), então um
// único GET /community/is-admin já gate-keeps as duas abas.

const OCRE = '#E8A020'

type Tab = 'community' | 'resources' | 'acquisition' | 'plans'

export default function AdminPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const [resourcesEditing, setResourcesEditing] = useState(false)
  const newResourceRef = useRef<() => void>(() => {})

  const rawTab = searchParams.get('tab')
  const tab: Tab = rawTab === 'resources' ? 'resources' : rawTab === 'acquisition' ? 'acquisition' : rawTab === 'plans' ? 'plans' : 'community'

  useEffect(() => {
    apiFetch<{ is_admin: boolean }>('/community/is-admin')
      .then(d => setAllowed(d.is_admin))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <PageLoader />
  if (!allowed) { navigate('/dashboard'); return null }

  function setTab(next: Tab) {
    setSearchParams(next === 'community' ? {} : { tab: next })
  }

  return (
    <div className="space-y-6">
      <div>
        <div style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: OCRE, marginBottom: 6 }}>
          {(t as any).admin?.eyebrow ?? 'ADMINISTRAÇÃO'}
        </div>
        <h1 style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 26, color: 'var(--arvo-fg)' }}>{(t as any).admin?.title ?? 'Painel de administração'}</h1>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 rounded-full p-1" style={{ background: 'var(--arvo-chip-bg)', width: 'fit-content' }}>
          {(['community', 'resources', 'acquisition', 'plans'] as Tab[]).map(k => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className="px-4 py-1.5 rounded-full text-xs transition-all"
              style={{
                fontFamily: 'var(--arvo-font-body)', letterSpacing: '0.06em',
                background: tab === k ? 'var(--arvo-pill-active-bg)' : 'transparent',
                color: tab === k ? 'var(--arvo-pill-active-fg)' : 'var(--arvo-fg-muted)',
              }}
            >
              {k === 'community'
                ? ((t as any).admin?.tabCommunity ?? 'Comunidade')
                : k === 'resources'
                  ? ((t as any).admin?.tabResources ?? 'Recursos')
                  : k === 'acquisition'
                    ? ((t as any).admin?.tabAcquisition ?? 'Aquisição')
                    : ((t as any).admin?.tabPlans ?? 'Planos')}
            </button>
          ))}
        </div>

        {tab === 'resources' && !resourcesEditing && (
          <button
            onClick={() => newResourceRef.current()}
            style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, padding: '8px 18px', borderRadius: 999, border: 'none', background: OCRE, color: '#1a1200', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {(t as any).resources?.admin?.newResource ?? '+ Novo recurso'}
          </button>
        )}
      </div>

      {tab === 'community' ? (
        <CommunityAdminPage />
      ) : tab === 'acquisition' ? (
        <AcquisitionAdminPage />
      ) : tab === 'plans' ? (
        <PlansAdminPage />
      ) : (
        <ResourcesAdminPage
          onRegisterNew={fn => { newResourceRef.current = fn }}
          onEditingChange={setResourcesEditing}
        />
      )}
    </div>
  )
}
