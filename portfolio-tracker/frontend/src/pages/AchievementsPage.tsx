import { useMemo, useEffect, useState } from 'react'
import { ACHIEVEMENT_DEFS, LEVELS, getLevel, getNextLevel, getLevelProgress } from '../lib/achievementDefs'
import { useAchievementContext } from '../contexts/AchievementContext'
import { usePortfolioValue } from '../hooks/usePortfolio'
import { useI18n } from '../contexts/I18nContext'
import Medal from '../components/Medal'
import CelebrationModal from '../components/CelebrationModal'

export default function AchievementsPage() {
  const { earned, earnedKeys, totalXp, loading, triggerCheck } = useAchievementContext()
  const { data: portfolio } = usePortfolioValue()
  const [checking, setChecking] = useState(false)
  const [preview, setPreview] = useState(false)
  const { t } = useI18n()

  const level = getLevel(totalXp)
  const nextLevel = getNextLevel(totalXp)
  const progress = getLevelProgress(totalXp)

  // Auto-check on mount once portfolio value is available
  useEffect(() => {
    if (portfolio?.total_brl == null) return
    setChecking(true)
    triggerCheck(portfolio.total_brl).finally(() => setChecking(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio?.total_brl])

  const earnedMap = useMemo(() => {
    const m: Record<string, string> = {}
    earned.forEach(e => { m[e.achievement_key] = e.earned_at })
    return m
  }, [earned])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t.achievements.title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{earnedKeys.length} {t.achievements.of} {ACHIEVEMENT_DEFS.length} {t.achievements.subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          {(loading || checking) && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-[#001A70]" />
              {t.achievements.checking}
            </div>
          )}
          <button
            onClick={() => setPreview(true)}
            className="text-xs text-gray-400 hover:text-[#001A70] border border-gray-200 hover:border-[#001A70]/30 rounded-lg px-3 py-1.5 transition-colors"
          >
            {t.achievements.preview}
          </button>
        </div>
      </div>

      {/* Level card */}
      <div className="bg-gradient-to-br from-[#0A0F1E] to-[#001A70] rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-3xl">{level.emoji}</span>
            <div>
              <p className="text-[#C9A227] text-xs font-bold uppercase tracking-widest">{t.achievements.currentLevel}</p>
              <p className="text-white font-bold text-lg">{level.name}</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[#C9A227] font-bold text-2xl">{totalXp}</span>
            <span className="text-gray-400 text-sm"> XP</span>
          </div>
        </div>

        <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #2563EB, #C9A227)' }}
          />
        </div>

        <div className="flex justify-between mt-2 text-xs text-gray-400">
          <span>{level.minXp} XP</span>
          {nextLevel
            ? <span>{t.achievements.nextLevel}: {nextLevel.emoji} {nextLevel.name} · {nextLevel.minXp} {t.achievements.xp}</span>
            : <span className="text-[#D4AF37]">{t.achievements.maxLevel}</span>
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
              className={`flex-1 rounded-xl py-2.5 text-center text-xs font-medium border transition-all ${
                isActive
                  ? 'border-[#001A70] bg-[#001A70]/10 text-[#001A70]'
                  : isPast
                  ? 'border-green-200 bg-green-50 text-green-700'
                  : 'border-gray-100 bg-gray-50 text-gray-400'
              }`}
            >
              <div className="text-base">{l.emoji}</div>
              <div className="truncate px-1 mt-0.5">{l.name}</div>
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
              className={`rounded-2xl border p-4 flex flex-col items-center text-center transition-all ${
                isEarned
                  ? 'border-gray-200 bg-white shadow-sm'
                  : 'border-gray-100 bg-gray-50'
              }`}
            >
              <Medal def={def} earned={isEarned} size={80} />

              <p className={`mt-3 text-sm font-bold leading-tight ${isEarned ? 'text-gray-900' : 'text-gray-400'}`}>
                {(t.achievementDefs as Record<string, { name: string; desc: string }>)[def.key]?.name ?? def.name}
              </p>
              <p className={`mt-1 text-xs leading-snug ${isEarned ? 'text-gray-500' : 'text-gray-400'}`}>
                {(t.achievementDefs as Record<string, { name: string; desc: string }>)[def.key]?.desc ?? def.description}
              </p>

              {isEarned ? (
                <div className="mt-2 flex items-center gap-1 flex-wrap justify-center">
                  <span className="text-[#C9A227] text-xs font-bold">+{def.xp} {t.achievements.xp}</span>
                  {earnedAt && (
                    <span className="text-gray-400 text-xs">
                      · {new Date(earnedAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}
                    </span>
                  )}
                </div>
              ) : (
                <span className="mt-2 text-gray-400 text-xs">🔒 {def.xp} {t.achievements.xp}</span>
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
