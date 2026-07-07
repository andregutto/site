import type { AchievementDef } from '../lib/achievementDefs'
import { resolveAchievementDesc } from '../lib/achievementDefs'
import { useI18n } from '../contexts/I18nContext'
import { useCurrency } from '../contexts/CurrencyContext'
import Medal from './Medal'

interface Props {
  def: AchievementDef
  onClose: () => void
}

export default function CelebrationModal({ def, onClose }: Props) {
  const { t } = useI18n()
  const { currency: displayCurrency } = useCurrency()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: 'var(--arvo-overlay)' }}>
      <style>{`
        @keyframes celebration-pop {
          0%   { transform: scale(0.94); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes celebration-fade {
          0%   { opacity: 0; transform: scale(0.92); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes celebration-hairline {
          0%   { transform: scaleX(0); opacity: 0; }
          100% { transform: scaleX(1); opacity: 1; }
        }
      `}</style>

      {/* Modal */}
      <div
        className="relative rounded-3xl px-10 py-10 text-center shadow-2xl overflow-hidden"
        style={{
          maxWidth: 360,
          background: 'var(--arvo-surface)',
          border: '1px solid rgba(200,184,154,0.30)',
          animation: 'celebration-pop 0.4s ease-out forwards',
        }}
      >
        {/* Hairline accent */}
        <div
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 1,
            background: 'linear-gradient(to right, transparent, rgba(200,184,154,0.55), transparent)',
            animation: 'celebration-hairline 0.6s ease-out 0.2s forwards',
            transform: 'scaleX(0)',
          }}
        />

        <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--arvo-gold-text)' }}>{t.achievements.unlocked}</p>

        <div style={{ animation: 'celebration-fade 0.5s ease-out forwards', display: 'inline-block' }}>
          <Medal def={def} earned animate size={120} />
        </div>

        <h2 className="text-2xl font-bold mt-5" style={{ color: 'var(--arvo-fg)' }}>{(t.achievementDefs as Record<string, {name: string; desc: string}>)[def.key]?.name ?? def.name}</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--arvo-fg-soft)' }}>{resolveAchievementDesc(def.key, (t.achievementDefs as Record<string, {name: string; desc: string}>)[def.key]?.desc ?? def.description, displayCurrency)}</p>

        <div className="mt-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5" style={{ background: 'var(--arvo-gold-tint)', border: '1px solid rgba(200,184,154,0.30)' }}>
          <span className="font-bold text-lg" style={{ color: 'var(--arvo-gold-text)' }}>+{def.xp}</span>
          <span className="text-sm" style={{ color: 'var(--arvo-fg-soft)' }}>{t.achievements.xp}</span>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full font-bold py-2.5 rounded-xl transition-opacity hover:opacity-90"
          style={{ background: 'var(--arvo-fg)', color: 'var(--arvo-pill-active-fg)' }}
        >
          {t.achievements.amazing}
        </button>
      </div>
    </div>
  )
}
