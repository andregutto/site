import { useState, useEffect } from 'react'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
import { catName } from './_shared/catName'
import type { CommunityCategory, VoyageTripOption } from './types'

const GOLD = '#E8A020'

interface NewTopicModalProps {
  categories: CommunityCategory[]
  defaultCategorySlug?: string
  onClose: () => void
  onCreated: (categorySlug: string, topicId: number) => void
}

export default function NewTopicModal({ categories, defaultCategorySlug, onClose, onCreated }: NewTopicModalProps) {
  const { t } = useI18n()
  const tc = (t as any).community ?? {}
  const [categorySlug, setCategorySlugState] = useState(defaultCategorySlug ?? categories[0]?.slug ?? '')
  function setCategorySlug(slug: string) {
    setCategorySlugState(slug)
    if (slug !== 'viagens') setLinkedTripId(null)
  }
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [linkedTripId, setLinkedTripId] = useState<number | null>(null)
  const [trips, setTrips] = useState<VoyageTripOption[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<{ trips: any[] }>('/voyage/trips')
      .then(d => setTrips((d.trips ?? []).filter(tr => !!tr.share_token).map(tr => ({
        id: tr.id, title: tr.title, destination: tr.destination, share_token: tr.share_token,
      }))))
      .catch(() => {})
  }, [])

  async function submit() {
    setError(null)
    if (!title.trim()) { setError(tc.errors?.titleRequired ?? 'O título é obrigatório.'); return }
    if (!body.trim()) { setError(tc.errors?.bodyRequired ?? 'A mensagem é obrigatória.'); return }
    setSaving(true)
    try {
      const res = await apiFetch<{ topic: { id: number } }>('/community/topics', {
        method: 'POST',
        body: JSON.stringify({ category_slug: categorySlug, title: title.trim(), body: body.trim(), linked_trip_id: linkedTripId ?? undefined }),
      })
      onCreated(categorySlug, res.topic.id)
    } catch (err: any) {
      setError(err.message ?? tc.errors?.generic ?? 'Algo deu errado.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl"
        style={{
          background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)',
          padding: '24px 24px calc(20px + env(safe-area-inset-bottom, 0px))',
          maxHeight: '92vh', overflowY: 'auto',
        }}
      >
        <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 18, letterSpacing: '0.04em', color: 'var(--arvo-fg)', marginBottom: 18 }}>
          {tc.newTopic ?? 'Novo tópico'}
        </p>

        <label style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }}>
          {tc.topicCategoryLabel ?? 'Categoria'}
        </label>
        <select
          value={categorySlug}
          onChange={e => setCategorySlug(e.target.value)}
          style={{ width: '100%', marginTop: 6, marginBottom: 14, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--arvo-border)', background: 'var(--arvo-bg)', color: 'var(--arvo-fg)', fontFamily: 'var(--arvo-font-body)', fontSize: 14.5 }}
        >
          {categories.map(c => (
            <option key={c.slug} value={c.slug}>{catName(tc, c)}</option>
          ))}
        </select>

        <label style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }}>
          {tc.topicTitleLabel ?? 'Título'}
        </label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={tc.topicTitlePlaceholder ?? 'Do que você quer falar?'}
          style={{ width: '100%', marginTop: 6, marginBottom: 14, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--arvo-border)', background: 'var(--arvo-bg)', color: 'var(--arvo-fg)', fontFamily: 'var(--arvo-font-body)', fontSize: 14.5 }}
        />

        <label style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }}>
          {tc.topicBodyLabel ?? 'Mensagem'}
        </label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={5}
          placeholder={tc.topicBodyPlaceholder ?? 'Escreva sua mensagem...'}
          style={{ width: '100%', marginTop: 6, marginBottom: 14, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--arvo-border)', background: 'var(--arvo-bg)', color: 'var(--arvo-fg)', fontFamily: 'var(--arvo-font-body)', fontSize: 14.5, resize: 'vertical', lineHeight: 1.6 }}
        />

        {categorySlug === 'viagens' && trips.length > 0 && (
          <>
            <label style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }}>
              {tc.linkTripLabel ?? 'Vincular uma viagem (opcional)'}
            </label>
            <select
              value={linkedTripId ?? ''}
              onChange={e => setLinkedTripId(e.target.value ? Number(e.target.value) : null)}
              style={{ width: '100%', marginTop: 6, marginBottom: 14, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--arvo-border)', background: 'var(--arvo-bg)', color: 'var(--arvo-fg)', fontFamily: 'var(--arvo-font-body)', fontSize: 14.5 }}
            >
              <option value="">{tc.linkTripNone ?? 'Nenhuma'}</option>
              {trips.map(tr => (
                <option key={tr.id} value={tr.id}>{tr.title}{tr.destination ? ` · ${tr.destination}` : ''}</option>
              ))}
            </select>
          </>
        )}

        {error && <p style={{ fontSize: 13, color: '#D63B2F', marginBottom: 10 }}>{error}</p>}

        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={submit}
            disabled={saving}
            style={{
              fontFamily: 'var(--arvo-font-body)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: GOLD, color: '#1a1200', opacity: saving ? 0.6 : 1,
            }}
          >{saving ? (tc.creating ?? 'Criando...') : (tc.create ?? 'Criar tópico')}</button>
          <button
            onClick={onClose}
            style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '10px 18px', borderRadius: 10, border: '1px solid var(--arvo-border)', background: 'transparent', color: 'var(--arvo-fg-soft)', cursor: 'pointer' }}
          >{tc.cancel ?? 'Cancelar'}</button>
        </div>
      </div>
    </div>
  )
}
