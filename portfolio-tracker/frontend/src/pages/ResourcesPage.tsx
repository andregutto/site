import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../contexts/I18nContext'
import { apiFetch } from '../lib/api'
import ArvoLoader from '../components/ArvoLoader'

// Listagem interna dos Recursos (lead magnets do canal). Cada card só navega
// pra /recursos/:slug — o desbloqueio de verdade acontece lá (ResourceDetailPage,
// dentro do AppLayout), nunca aqui. Chamar unlock direto no card e depois
// window.open() o link resultante cai no bloqueio de popup do navegador (o
// gap assíncrono entre o clique e o window.open faz o browser não reconhecer
// como ação direta do usuário); a versão pública com gate de cadastro fica em
// /recursos/:slug pra quem não está logado (ResourcePublicPage).

interface ResourceItem {
  slug: string
  title: string
  description: string | null
  resource_type: 'file' | 'link' | 'content'
  preview_image_url: string | null
  cover_image_position: string | null
  visibility: 'free' | 'paid'
  unlocked: boolean
}

function TypeIcon({ type }: { type: ResourceItem['resource_type'] }) {
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

export default function ResourcesPage() {
  const { t } = useI18n()
  const r = t.resources

  const [items, setItems] = useState<ResourceItem[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch<{ resources: ResourceItem[]; is_admin: boolean }>('/resources')
      .then(data => { setItems(data.resources); setIsAdmin(data.is_admin) })
      .catch(() => setError(r.loadError))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl" style={{ fontFamily: "var(--arvo-font-body)", color: 'var(--arvo-fg)', letterSpacing: '0.04em' }}>{r.title}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--arvo-fg-soft)' }}>{r.subtitle}</p>
        </div>
        {isAdmin && (
          <Link
            to="/recursos/admin"
            title="Admin"
            className="w-8 h-8 flex items-center justify-center rounded-full border border-[var(--arvo-border)] text-[var(--arvo-fg-muted)] hover:text-[var(--arvo-fg)] transition-colors shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.43.992a6.759 6.759 0 010 .255c-.008.378.137.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Link>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><ArvoLoader size={32} style={{ color: 'var(--arvo-gold)' }} /></div>
      ) : error ? (
        <p className="text-sm" style={{ color: 'var(--arvo-red, #D63B2F)' }}>{error}</p>
      ) : !items.length ? (
        <p className="text-sm py-8" style={{ color: 'var(--arvo-fg-soft)' }}>{r.empty}</p>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {items.map(item => (
            <Link key={item.slug} to={`/recursos/${item.slug}`} className="rounded-2xl overflow-hidden flex flex-col" style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border-soft)', textDecoration: 'none' }}>
              {item.preview_image_url ? (
                <img src={item.preview_image_url} alt="" style={{ width: '100%', height: 140, objectFit: 'cover', objectPosition: item.cover_image_position ?? '50% 50%', display: 'block' }} />
              ) : (
                <div className="h-[140px] flex items-center justify-center" style={{ background: 'var(--arvo-black)' }}>
                  <img src="/brand/logo/arvo-symbol-gold.svg" width="28" height="30" alt="" />
                </div>
              )}
              <div className="p-4 flex flex-col gap-2 flex-1">
                <div className="flex items-center gap-2" style={{ color: 'var(--arvo-fg-soft)' }}>
                  <TypeIcon type={item.resource_type} />
                  <span style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                    {item.visibility === 'paid' ? r.members : r.free}
                  </span>
                  {item.unlocked && (
                    <span style={{ marginLeft: 'auto', fontFamily: 'var(--arvo-font-body)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--arvo-green, #1F8A5B)' }}>
                      {r.unlocked}
                    </span>
                  )}
                </div>
                <h2 className="text-base" style={{ fontFamily: 'var(--arvo-font-body)', fontWeight: 600, color: 'var(--arvo-fg)', margin: 0 }}>{item.title}</h2>
                {item.description && (
                  <p className="text-sm" style={{ color: 'var(--arvo-fg-soft)', margin: 0, lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {item.description}
                  </p>
                )}
                <div className="mt-auto pt-2">
                  <span className="inline-block w-full text-center py-2.5 rounded-lg text-xs"
                    style={{ fontFamily: 'var(--arvo-font-body)', letterSpacing: '0.12em', textTransform: 'uppercase', background: item.visibility === 'paid' ? 'transparent' : 'var(--arvo-black, #0D0D0D)', color: item.visibility === 'paid' ? 'var(--arvo-fg-soft)' : 'var(--arvo-offwhite, #F6F3EC)' }}
                  >
                    {item.visibility === 'paid' ? r.membersSoon : item.unlocked ? (item.resource_type === 'file' ? r.download : item.resource_type === 'link' ? r.open : r.view) : r.unlockCta}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
