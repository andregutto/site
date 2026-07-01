import { useEffect } from 'react'
import type { AchievementDef } from '../lib/achievementDefs'
import { resolveAchievementDesc } from '../lib/achievementDefs'
import { useI18n } from '../contexts/I18nContext'
import { useCurrency } from '../contexts/CurrencyContext'
import Medal from './Medal'

interface Props {
  def: AchievementDef
  onClose: () => void
}

export default function AchievementToast({ def, onClose }: Props) {
  const { t } = useI18n()
  const { currency: displayCurrency } = useCurrency()
  useEffect(() => {
    const timer = setTimeout(onClose, 4000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl animate-slide-in"
      style={{ minWidth: 280, background: 'var(--arvo-surface)', border: '1px solid rgba(200,184,154,0.30)' }}
    >
      <Medal def={def} earned size={52} />
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--arvo-gold-text)' }}>{t.achievements.unlocked}</p>
        <p className="font-bold text-sm" style={{ color: 'var(--arvo-fg)' }}>{(t.achievementDefs as Record<string, {name: string; desc: string}>)[def.key]?.name ?? def.name}</p>
        <p className="text-[var(--arvo-fg-soft)] text-xs">{resolveAchievementDesc(def.key, (t.achievementDefs as Record<string, {name: string; desc: string}>)[def.key]?.desc ?? def.description, displayCurrency)} · +{def.xp} {t.achievements.xp}</p>
      </div>
      <button onClick={onClose} className="ml-auto text-[var(--arvo-fg-muted)] hover:text-[var(--arvo-fg)] text-lg leading-none">×</button>
    </div>
  )
}
