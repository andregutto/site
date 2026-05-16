import { useMemo } from 'react'
import { ACHIEVEMENT_DEFS, LEVELS, getLevel, getNextLevel, getLevelProgress } from '../lib/achievementDefs'
import { useAchievementContext } from '../contexts/AchievementContext'
import Medal from '../components/Medal'

export default function AchievementsPage() {
  const { earned, earnedKeys, totalXp, loading } = useAchievementContext()
  const level = getLevel(totalXp)
  const nextLevel = getNextLevel(totalXp)
  const progress = getLevelProgress(totalXp)

  const earnedMap = useMemo(() => {
    const m: Record<string, string> = {}
    earned.forEach(e => { m[e.achievement_key] = e.earned_at })
    return m
  }, [earned])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#020817]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[#C9A227]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#020817] pb-16">
      {/* Header */}
      <div className="bg-gradient-to-b from-[#0A0F1E] to-transparent px-6 pt-8 pb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Conquistas</h1>
        <p className="text-gray-400 text-sm">{earnedKeys.length} de {ACHIEVEMENT_DEFS.length} desbloqueadas</p>

        {/* Level card */}
        <div className="mt-5 bg-[#0A0F1E] border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-2xl mr-2">{level.emoji}</span>
              <span className="text-white font-bold text-lg">{level.name}</span>
            </div>
            <div className="text-right">
              <span className="text-[#C9A227] font-bold text-xl">{totalXp}</span>
              <span className="text-gray-500 text-sm"> XP</span>
            </div>
          </div>

          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${level.name === 'Liberdade' ? '#D4AF37, #FFD700' : '#2563EB, #C9A227'})` }}
            />
          </div>

          <div className="flex justify-between mt-2 text-xs text-gray-500">
            <span>{level.minXp} XP</span>
            {nextLevel
              ? <span>Próximo: {nextLevel.emoji} {nextLevel.name} ({nextLevel.minXp} XP)</span>
              : <span className="text-[#D4AF37]">Nível máximo!</span>
            }
          </div>
        </div>

        {/* Level ladder */}
        <div className="mt-4 flex gap-2">
          {LEVELS.map(l => {
            const isActive = l.name === level.name
            const isPast = LEVELS.indexOf(l) < LEVELS.indexOf(level)
            return (
              <div
                key={l.name}
                className={`flex-1 rounded-lg py-2 text-center text-xs font-medium border transition-all ${
                  isActive
                    ? 'border-[#C9A227] bg-[#C9A227]/10 text-[#C9A227]'
                    : isPast
                    ? 'border-green-700/40 bg-green-900/10 text-green-400'
                    : 'border-white/5 bg-white/3 text-gray-600'
                }`}
              >
                <div className="text-base">{l.emoji}</div>
                <div className="truncate px-1">{l.name}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Achievements grid */}
      <div className="px-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mt-2">
        {ACHIEVEMENT_DEFS.map(def => {
          const isEarned = earnedKeys.includes(def.key)
          const earnedAt = earnedMap[def.key]
          return (
            <div
              key={def.key}
              className={`rounded-2xl border p-4 flex flex-col items-center text-center transition-all ${
                isEarned
                  ? 'border-white/20 bg-[#0A0F1E]'
                  : 'border-white/5 bg-[#0A0F1E]/40'
              }`}
            >
              <Medal def={def} earned={isEarned} size={80} />

              <p className={`mt-3 text-sm font-bold leading-tight ${isEarned ? 'text-white' : 'text-gray-600'}`}>
                {def.name}
              </p>
              <p className={`mt-1 text-xs leading-snug ${isEarned ? 'text-gray-400' : 'text-gray-700'}`}>
                {def.description}
              </p>

              {isEarned ? (
                <div className="mt-2 flex items-center gap-1">
                  <span className="text-[#C9A227] text-xs font-bold">+{def.xp} XP</span>
                  {earnedAt && (
                    <span className="text-gray-600 text-xs">
                      · {new Date(earnedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                    </span>
                  )}
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-1">
                  <span className="text-gray-700 text-xs">🔒 {def.xp} XP</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
