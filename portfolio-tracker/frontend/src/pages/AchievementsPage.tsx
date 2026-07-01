import { useMemo, useEffect, useState } from 'react'
import { ACHIEVEMENT_DEFS, LEVELS, getLevel, getNextLevel, getLevelProgress, resolveAchievementDesc } from '../lib/achievementDefs'
import { useAchievementContext } from '../contexts/AchievementContext'
import { usePortfolioValue } from '../hooks/usePortfolio'
import { useI18n } from '../contexts/I18nContext'
import { useCurrency } from '../contexts/CurrencyContext'
import Medal from '../components/Medal'
import CelebrationModal from '../components/CelebrationModal'
import { Icon } from '../components/icons'

export default function AchievementsPage() {
  const { earned, earnedKeys, totalXp, loading, triggerCheck } = useAchievementContext()
  const { data: portfolio } = usePortfolioValue()
  const { currency: displayCurrency } = useCurrency()
  const [checking, setChecking] = useState(false)
  const [preview, setPreview] = useState(false)
  const { t } = useI18n()

  const level = getLevel(totalXp)
  const nextLevel = getNextLevel(totalXp)
  const progress = getLevelProgress(totalXp)

  // Auto-check on mount once portfolio value is available
  useEffect(() => {
    if (portfolio?.total_brl == null) return
    const displayTotal = displayCurrency === 'EUR' ? (portfolio.total_eur ?? undefined)
      : displayCurrency === 'USD' ? (portfolio.total_usd ?? undefined)
      : undefined
    setChecking(true)
    triggerCheck(portfolio.total_brl, displayTotal, displayCurrency).finally(() => setChecking(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio?.total_brl])

  const earnedMap = useMemo(() => {
    const m: Record<string, string> = {}
    earned.forEach(e => { m[e.achievement_key] = e.earned_at })
    return m
  }, [earned])

  const resolveDesc = (key: string, desc: string) => resolveAchievementDesc(key, desc, displayCurrency)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl" style={{ fontFamily: "var(--arvo-font-body)", color: 'var(--arvo-fg)', letterSpacing: '0.04em' }}>{t.achievements.title}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--arvo-fg-soft)' }}>{earnedKeys.length} {t.achievements.of} {ACHIEVEMENT_DEFS.length} {t.achievements.subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          {(loading || checking) && (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--arvo-fg-soft)' }}>
              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-[var(--arvo-fg)]" />
              {t.achievements.checking}
            </div>
          )}
          <button
            onClick={() => setPreview(true)}
            className="text-xs rounded-lg px-3 py-1.5 transition-colors"
            style={{ color: 'var(--arvo-fg-soft)', border: '1px solid var(--arvo-border-soft)' }}
          >
            {t.achievements.preview}
          </button>
        </div>
      </div>

      {/* Level card */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--arvo-surface)', border: '1px solid rgba(200,184,154,0.30)', boxShadow: '0 4px 24px rgba(200,184,154,0.16)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -80, right: -40, width: 260, height: 260, borderRadius: '50%', background: 'rgba(200,184,154,0.09)', filter: 'blur(60px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(to right, transparent, rgba(200,184,154,0.55), transparent)', pointerEvents: 'none' }} />
        <div className="flex items-center justify-between mb-3" style={{ position: 'relative', zIndex: 1 }}>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--arvo-gold-tint)', color: 'var(--arvo-gold-text)' }}>
              <Icon name={level.icon} size={20} />
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest" style={{ fontFamily: "var(--arvo-font-body)", color: 'var(--arvo-gold-text)' }}>{t.achievements.currentLevel}</p>
              <p style={{ fontFamily: "var(--arvo-font-body)", fontSize: 18, color: 'var(--arvo-fg)' }}>{(t.levels as Record<string,string>)[level.key] ?? level.name}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-bold text-xl" style={{ color: 'var(--arvo-fg)' }}>
              {totalXp} <span style={{ color: 'var(--arvo-gold)' }}>{t.achievements.xp}</span>
            </p>
            <p className="text-xs" style={{ color: 'var(--arvo-fg-soft)' }}>{earnedKeys.length}/{ACHIEVEMENT_DEFS.length} {t.achievements.subtitle}</p>
          </div>
        </div>

        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--arvo-track-bg)', position: 'relative', zIndex: 1 }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${progress}%`, background: 'linear-gradient(90deg, var(--arvo-gold), var(--arvo-fg))' }}
          />
        </div>

        <div className="flex justify-between mt-2 text-xs" style={{ color: 'var(--arvo-fg-muted)', fontFamily: "var(--arvo-font-body)", position: 'relative', zIndex: 1 }}>
          <span>{level.minXp} XP</span>
          {nextLevel
            ? <span className="inline-flex items-center gap-1">{t.achievements.nextLevel}: <Icon name={nextLevel.icon} size={12} /> {(t.levels as Record<string,string>)[nextLevel.key] ?? nextLevel.name} · {nextLevel.minXp} {t.achievements.xp}</span>
            : <span style={{ color: 'var(--arvo-gold)' }}>{t.achievements.maxLevel}</span>
          }
        </div>
      </div>

      {/* Level ladder */}
      <div className="flex gap-2">
        {LEVELS.map(l => {
          const idx = LEVELS.indexOf(l)
          const curIdx = LEVELS.indexOf(level)
          const isActive = l.name === level.name
          const isPast = idx < curIdx
          return (
            <div
              key={l.name}
              className="flex-1 rounded-xl py-2.5 text-center text-xs transition-all"
              style={isActive
                ? { border: '1px solid var(--arvo-fg)', background: 'var(--arvo-track-bg)', color: 'var(--arvo-fg)', fontFamily: "var(--arvo-font-body)" }
                : isPast
                ? { border: '1px solid rgba(31,138,91,0.3)', background: 'rgba(31,138,91,0.07)', color: 'var(--arvo-green)', fontFamily: "var(--arvo-font-body)" }
                : { border: '1px solid var(--arvo-border-soft)', background: 'transparent', color: 'var(--arvo-fg-soft)', fontFamily: "var(--arvo-font-body)" }}
            >
              <div className="flex justify-center">
                <Icon name={l.icon} size={18} />
              </div>
              <div className="truncate px-1 mt-0.5">{(t.levels as Record<string,string>)[l.key] ?? l.name}</div>
            </div>
          )
        })}
      </div>

      {/* Achievements grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {ACHIEVEMENT_DEFS.map(def => {
          const isEarned = earnedKeys.includes(def.key)
          const earnedAt = earnedMap[def.key]
          return (
            <div
              key={def.key}
              className="rounded-2xl p-4 flex flex-col items-center text-center transition-all"
              style={isEarned
                ? { border: '1px solid rgba(200,184,154,0.30)', background: 'var(--arvo-surface)', boxShadow: '0 1px 8px rgba(200,184,154,0.12)' }
                : { border: '1px solid var(--arvo-border-soft)', background: 'rgba(232,223,208,0.20)', opacity: 0.55 }}
            >
              <Medal def={def} earned={isEarned} size={80} />

              <p className="mt-3 text-sm leading-tight" style={{ fontFamily: "var(--arvo-font-body)", color: isEarned ? 'var(--arvo-fg)' : 'var(--arvo-fg-soft)' }}>
                {(t.achievementDefs as Record<string, { name: string; desc: string }>)[def.key]?.name ?? def.name}
              </p>
              <p className="mt-1 text-xs leading-snug" style={{ color: isEarned ? 'var(--arvo-fg-muted)' : 'var(--arvo-fg-soft)' }}>
                {resolveDesc(def.key, (t.achievementDefs as Record<string, { name: string; desc: string }>)[def.key]?.desc ?? def.description)}
              </p>

              {isEarned ? (
                <div className="mt-2 flex items-center gap-1 flex-wrap justify-center">
                  <span className="text-xs" style={{ fontFamily: "var(--arvo-font-body)", color: 'var(--arvo-gold-text)' }}>+{def.xp} {t.achievements.xp}</span>
                  {earnedAt && (
                    <span className="text-xs" style={{ color: 'var(--arvo-fg-soft)' }}>
                      · {new Date(earnedAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}
                    </span>
                  )}
                </div>
              ) : (
                <span className="mt-2 text-xs flex items-center gap-1" style={{ color: 'var(--arvo-fg-soft)', fontFamily: "var(--arvo-font-body)" }}>
                  <Icon name="lock" size={12} />
                  {def.xp} {t.achievements.xp}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {preview && (
        <CelebrationModal
          def={ACHIEVEMENT_DEFS.find(d => d.key === 'million_club')!}
          onClose={() => setPreview(false)}
        />
      )}
    </div>
  )
}
