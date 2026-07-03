import { useState, useEffect } from 'react'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../contexts/I18nContext'
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
  const [categorySlug, setCategorySlug] = useState(defaultCategorySlug ?? categories[0]?.slug ?? '')
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl"
        style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)', padding: '24px 24px 20px', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <p style={{ fontFamily: 'var(--arvo-font-display)', fontSize: 18, letterSpacing: '0.04em', color: 'var(--arvo-fg)', marginBottom: 18 }}>
          {tc.newTopic ?? 'Novo tópico'}
        </p>

        <label style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }}>
          {tc.topicCategoryLabel ?? 'Categoria'}
        </label>
        <select
          value={categorySlug}
          onChange={e => setCategorySlug(e.target.value)}
          style={{ width: '100%', marginTop: 6, marginBottom: 14, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--arvo-border)', background: 'var(--arvo-bg)', color: 'var(--arvo-fg)', fontFamily: 'var(--arvo-font-body)', fontSize: 13.5 }}
        >
          {categories.map(c => (
            <option key={c.slug} value={c.slug}>{tc.cat?.[c.slug] ?? c.slug}</option>
          ))}
        </select>

        <label style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }}>
          {tc.topicTitleLabel ?? 'Título'}
        </label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={tc.topicTitlePlaceholder ?? 'Do que você quer falar?'}
          style={{ width: '100%', marginTop: 6, marginBottom: 14, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--arvo-border)', background: 'var(--arvo-bg)', color: 'var(--arvo-fg)', fontFamily: 'var(--arvo-font-body)', fontSize: 13.5 }}
        />

        <label style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }}>
          {tc.topicBodyLabel ?? 'Mensagem'}
        </label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={5}
          placeholder={tc.topicBodyPlaceholder ?? 'Escreva sua mensagem...'}
          style={{ width: '100%', marginTop: 6, marginBottom: 14, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--arvo-border)', background: 'var(--arvo-bg)', color: 'var(--arvo-fg)', fontFamily: 'var(--arvo-font-body)', fontSize: 13.5, resize: 'vertical', lineHeight: 1.6 }}
        />

        {trips.length > 0 && (
          <>
            <label style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--arvo-fg-soft)' }}>
              {tc.linkTripLabel ?? 'Vincular uma viagem (opcional)'}
            </label>
            <select
              value={linkedTripId ?? ''}
              onChange={e => setLinkedTripId(e.target.value ? Number(e.target.value) : null)}
              style={{ width: '100%', marginTop: 6, marginBottom: 14, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--arvo-border)', background: 'var(--arvo-bg)', color: 'var(--arvo-fg)', fontFamily: 'var(--arvo-font-body)', fontSize: 13.5 }}
            >
              <option value="">{tc.linkTripNone ?? 'Nenhuma'}</option>
              {trips.map(tr => (
                <option key={tr.id} value={tr.id}>{tr.title}{tr.destination ? ` · ${tr.destination}` : ''}</option>
              ))}
            </select>
          </>
        )}

        {error && <p style={{ fontSize: 12, color: '#D63B2F', marginBottom: 10 }}>{error}</p>}

        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={submit}
            disabled={saving}
            style={{
              fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: GOLD, color: '#1a1200', opacity: saving ? 0.6 : 1,
            }}
          >{saving ? (tc.creating ?? 'Criando...') : (tc.create ?? 'Criar tópico')}</button>
          <button
            onClick={onClose}
            style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '10px 18px', borderRadius: 10, border: '1px solid var(--arvo-border)', background: 'transparent', color: 'var(--arvo-fg-soft)', cursor: 'pointer' }}
          >{tc.cancel ?? 'Cancelar'}</button>
        </div>
      </div>
    </div>
  )
}
