import { useEffect } from 'react'
import type { AchievementDef } from '../lib/achievementDefs'
import { useI18n } from '../contexts/I18nContext'
import Medal from './Medal'

interface Props {
  def: AchievementDef
  onClose: () => void
}

export default function AchievementToast({ def, onClose }: Props) {
  const { t } = useI18n()
  useEffect(() => {
    const timer = setTimeout(onClose, 4000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-[#0A0F1E] border border-[#C9A227]/40 rounded-2xl px-4 py-3 shadow-2xl animate-slide-in"
      style={{ minWidth: 280 }}
    >
      <Medal def={def} earned size={52} />
      <div>
        <p className="text-xs text-[#C9A227] font-semibold uppercase tracking-widest">{t.achievements.unlocked}</p>
        <p className="text-white font-bold text-sm">{def.name}</p>
        <p className="text-gray-400 text-xs">{def.description} · +{def.xp} {t.achievements.xp}</p>
      </div>
      <button onClick={onClose} className="ml-auto text-gray-500 hover:text-white text-lg leading-none">×</button>
    </div>
  )
}
