import { useState } from 'react'
import { useI18n } from '../contexts/I18nContext'
import { useNotificationsContext } from '../contexts/NotificationsContext'
import { resolveNotificationText } from '../lib/notifications'
import type { NotificationItem } from '../lib/types'

// Convites pendentes (viagem/momento/categoria) endereçados a este usuário,
// mostrados direto na página da lista — reaproveita os mesmos dados que já
// alimentam o sino de notificações, só filtrados por tipo.
export default function PendingInvitesBanner({ types }: { types: NotificationItem['type'][] }) {
  const { t, locale } = useI18n()
  const { active, dismiss, acceptInvite } = useNotificationsContext()
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const items = active.filter(i => types.includes(i.type))

  if (items.length === 0) return null

  async function handleAccept(item: NotificationItem) {
    setBusyKey(item.key)
    try { await acceptInvite(item) } finally { setBusyKey(null) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
      {items.map(item => {
        const { title } = resolveNotificationText(item, t, locale)
        const busy = busyKey === item.key
        return (
          <div
            key={item.key}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              borderRadius: 12, border: '1px solid rgba(214,59,47,0.25)', background: 'rgba(214,59,47,0.05)',
            }}
          >
            <span style={{ flex: 1, fontFamily: 'var(--arvo-font-body)', fontSize: 13, color: 'var(--arvo-fg)' }}>
              {title}
            </span>
            <button
              type="button" onClick={() => dismiss(item)}
              style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, color: 'var(--arvo-fg-soft)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              {t.notifications.dismiss}
            </button>
            <button
              type="button" onClick={() => handleAccept(item)} disabled={busy}
              style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 11.5, padding: '5px 14px', borderRadius: 999, background: 'var(--arvo-fg)', color: 'var(--arvo-pill-active-fg)', border: 'none', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
            >
              {busy ? t.notifications.accepting : t.notifications.accept}
            </button>
          </div>
        )
      })}
    </div>
  )
}
