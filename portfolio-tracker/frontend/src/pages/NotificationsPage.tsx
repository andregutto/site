import { useState } from 'react'
import type React from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../contexts/I18nContext'
import { useNotificationsContext } from '../contexts/NotificationsContext'
import { resolveNotificationText, SEVERITY_COLORS, TYPE_ICONS, formatTimestamp } from '../lib/notifications'
import type { NotificationItem } from '../lib/types'
import { Icon } from '../components/icons'

const ACCEPTABLE_TYPES = new Set(['trip_invite', 'moment_invite', 'shared_group_invite', 'friend_invite'])

function NotificationRow({ item, action }: { item: NotificationItem; action: React.ReactNode }) {
  const { t, locale } = useI18n()
  const { acceptInvite } = useNotificationsContext()
  const [accepting, setAccepting] = useState(false)
  const { title, subtitle } = resolveNotificationText(item, t, locale)
  const color = SEVERITY_COLORS[item.severity] ?? SEVERITY_COLORS.info
  const icon = TYPE_ICONS[item.type] ?? 'bell'
  const timestamp = formatTimestamp(item.dismissed_at ?? item.occurred_at, locale)
  const canAccept = ACCEPTABLE_TYPES.has(item.type) && !!item.params.token

  async function handleAccept(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setAccepting(true)
    try { await acceptInvite(item) } finally { setAccepting(false) }
  }

  const content = (
    <>
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${color}1A`, color }}
      >
        <Icon name={icon} size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium line-clamp-2" style={{ color: 'var(--arvo-fg)' }}>{title}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--arvo-fg-soft)' }}>
          {subtitle ? `${subtitle} · ` : ''}{timestamp}
        </p>
      </div>
    </>
  )

  return (
    <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm px-5 py-4 flex items-start gap-4">
      {item.link ? (
        <Link to={item.link} className="flex-1 min-w-0 flex items-start gap-4">{content}</Link>
      ) : (
        <div className="flex-1 min-w-0 flex items-start gap-4">{content}</div>
      )}
      {canAccept && (
        <button
          onClick={handleAccept}
          disabled={accepting}
          className="text-xs font-medium shrink-0 px-3 py-1.5 rounded-lg disabled:opacity-50"
          style={{ background: 'var(--arvo-fg)', color: 'var(--arvo-pill-active-fg)' }}
        >
          {accepting ? t.notifications.accepting : t.notifications.accept}
        </button>
      )}
      {action}
    </div>
  )
}

function DismissButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      className="p-1.5 text-[var(--arvo-fg-faint)] hover:text-[var(--arvo-fg-muted)] transition-colors shrink-0 rounded-lg hover:bg-[var(--arvo-surface-2)]"
      title={title}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
        <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
      </svg>
    </button>
  )
}

function RestoreButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="text-xs font-medium shrink-0 arvo-accent-blue">
      {label}
    </button>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm p-10 text-center">
      <div className="flex justify-center mb-2 text-[var(--arvo-fg-soft)]"><Icon name="bell" size={28} /></div>
      <p className="text-sm" style={{ color: 'var(--arvo-fg-soft)' }}>{text}</p>
    </div>
  )
}

export default function NotificationsPage() {
  const { t } = useI18n()
  const { active, history, dismiss, dismissAll, restore, removeFromHistory, clearHistory } = useNotificationsContext()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl" style={{ fontFamily: 'var(--arvo-font-body)', color: 'var(--arvo-fg)', letterSpacing: '0.04em' }}>
          {t.notifications.title}
        </h1>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--arvo-fg)' }}>{t.notifications.activeSection}</h2>
          {active.length > 0 && (
            <button
              onClick={() => dismissAll()}
              className="text-xs font-medium transition-colors arvo-accent-blue"
            >
              {t.notifications.dismissAll}
            </button>
          )}
        </div>
        {active.length === 0 ? (
          <EmptyState text={t.notifications.emptyActive} />
        ) : (
          <div className="space-y-2">
            {active.map(item => (
              <NotificationRow
                key={item.key}
                item={item}
                action={item.dismissible ? <DismissButton onClick={() => dismiss(item)} title={t.notifications.dismiss} /> : null}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--arvo-fg)' }}>{t.notifications.historySection}</h2>
          {history.length > 0 && (
            <button
              onClick={() => { if (confirm(t.notifications.clearHistoryConfirm)) clearHistory() }}
              className="text-xs font-medium transition-colors arvo-accent-blue"
            >
              {t.notifications.clearHistory}
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <EmptyState text={t.notifications.emptyHistory} />
        ) : (
          <div className="space-y-2">
            {history.map(item => (
              <NotificationRow
                key={item.key}
                item={item}
                action={item.dismissible ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <RestoreButton onClick={() => restore(item)} label={t.notifications.restore} />
                    <DismissButton onClick={() => removeFromHistory(item)} title={t.notifications.remove} />
                  </div>
                ) : null}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
