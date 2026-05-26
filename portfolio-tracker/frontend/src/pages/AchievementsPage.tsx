import { useMemo, useEffect, useState } from 'react'
import { ACHIEVEMENT_DEFS, LEVELS, getLevel, getNextLevel, getLevelProgress } from '../lib/achievementDefs'
import { useAchievementContext } from '../contexts/AchievementContext'
import { usePortfolioValue } from '../hooks/usePortfolio'
import { useI18n } from '../contexts/I18nContext'
import { useCurrency } from '../contexts/CurrencyContext'
import Medal from '../components/Medal'
import CelebrationModal from '../components/CelebrationModal'

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

  const WEALTH_THRESHOLDS: Record<string, { brl: number; other: number }> = {
    builder:        { brl: 10_000,      other: 2_000 },
    five_digits:    { brl: 10_000,      other: 10_000 },
    six_digits:     { brl: 100_000,     other: 100_000 },
    quarter_million:{ brl: 250_000,     other: 250_000 },
    half_million:   { brl: 500_000,     other: 500_000 },
    million_club:   { brl: 1_000_000,   other: 1_000_000 },
    three_million:  { brl: 3_000_000,   other: 3_000_000 },
    five_million:   { brl: 5_000_000,   other: 5_000_000 },
    ten_million:    { brl: 10_000_000,  other: 10_000_000 },
  }

  const fmtAmount = (amount: number, currency: string) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)

  const resolveDesc = (key: string, desc: string) => {
    if (!desc.includes('{amount}')) return desc
    const thresholds = WEALTH_THRESHOLDS[key]
    if (!thresholds) return desc
    const isBRL = !displayCurrency || displayCurrency === 'BRL'
    const cur = isBRL ? 'BRL' : displayCurrency
    const amount = isBRL ? thresholds.brl : thresholds.other
    return desc.replace('{amount}', fmtAmount(amount, cur))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl" style={{ fontFamily: "'Tenor Sans', sans-serif", color: 'var(--arvo-black)', letterSpacing: '0.04em' }}>{t.achievements.title}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(13,13,13,0.5)' }}>{earnedKeys.length} {t.achievements.of} {ACHIEVEMENT_DEFS.length} {t.achievements.subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          {(loading || checking) && (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'rgba(13,13,13,0.45)' }}>
              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-[#0D0D0D]" />
              {t.achievements.checking}
            </div>
          )}
          <button
            onClick={() => setPreview(true)}
            className="text-xs rounded-lg px-3 py-1.5 transition-colors"
            style={{ color: 'rgba(13,13,13,0.45)', border: '1px solid var(--arvo-border-soft)' }}
          >
            {t.achievements.preview}
          </button>
        </div>
      </div>

      {/* Level card */}
      <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, #111 0%, #0D0D0D 100%)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-3xl">{level.emoji}</span>
            <div>
              <p className="text-xs uppercase tracking-widest" style={{ fontFamily: "'Tenor Sans', sans-serif", color: 'var(--arvo-gold)' }}>{t.achievements.currentLevel}</p>
              <p className="text-white text-lg" style={{ fontFamily: "'Tenor Sans', sans-serif" }}>{(t.levels as Record<string,string>)[level.key] ?? level.name}</p>
            </div>
          </div>
          <div className="text-right">
            <span className="font-bold text-2xl" style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', color: 'var(--arvo-gold)' }}>{totalXp}</span>
            <span className="text-sm ml-1" style={{ color: 'rgba(200,184,154,0.5)', fontFamily: "'Tenor Sans', sans-serif" }}>XP</span>
          </div>
        </div>

        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${progress}%`, background: 'linear-gradient(90deg, var(--arvo-black), var(--arvo-gold))' }}
          />
        </div>

        <div className="flex justify-between mt-2 text-xs" style={{ color: 'rgba(200,184,154,0.5)', fontFamily: "'Tenor Sans', sans-serif" }}>
          <span>{level.minXp} XP</span>
          {nextLevel
            ? <span>{t.achievements.nextLevel}: {nextLevel.emoji} {(t.levels as Record<string,string>)[nextLevel.key] ?? nextLevel.name} · {nextLevel.minXp} {t.achievements.xp}</span>
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
                ? { border: '1px solid var(--arvo-black)', background: 'rgba(13,13,13,0.08)', color: 'var(--arvo-black)', fontFamily: "'Tenor Sans', sans-serif" }
                : isPast
                ? { border: '1px solid rgba(31,138,91,0.3)', background: 'rgba(31,138,91,0.07)', color: 'var(--arvo-green)', fontFamily: "'Tenor Sans', sans-serif" }
                : { border: '1px solid var(--arvo-border-soft)', background: 'transparent', color: 'rgba(13,13,13,0.35)', fontFamily: "'Tenor Sans', sans-serif" }}
            >
              <div className="text-base">{l.emoji}</div>
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
                ? { border: '1px solid rgba(200,184,154,0.30)', background: '#FFFFFF', boxShadow: '0 1px 8px rgba(200,184,154,0.12)' }
                : { border: '1px solid var(--arvo-border-soft)', background: 'rgba(232,223,208,0.20)', opacity: 0.55 }}
            >
              <Medal def={def} earned={isEarned} size={80} />

              <p className="mt-3 text-sm leading-tight" style={{ fontFamily: "'Tenor Sans', sans-serif", color: isEarned ? 'var(--arvo-black)' : 'rgba(13,13,13,0.4)' }}>
                {(t.achievementDefs as Record<string, { name: string; desc: string }>)[def.key]?.name ?? def.name}
              </p>
              <p className="mt-1 text-xs leading-snug" style={{ color: isEarned ? 'rgba(13,13,13,0.55)' : 'rgba(13,13,13,0.35)' }}>
                {resolveDesc(def.key, (t.achievementDefs as Record<string, { name: string; desc: string }>)[def.key]?.desc ?? def.description)}
              </p>

              {isEarned ? (
                <div className="mt-2 flex items-center gap-1 flex-wrap justify-center">
                  <span className="text-xs" style={{ fontFamily: "'Tenor Sans', sans-serif", color: 'var(--arvo-gold)' }}>+{def.xp} {t.achievements.xp}</span>
                  {earnedAt && (
                    <span className="text-xs" style={{ color: 'rgba(13,13,13,0.35)' }}>
                      · {new Date(earnedAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}
                    </span>
                  )}
                </div>
              ) : (
                <span className="mt-2 text-xs" style={{ color: 'rgba(13,13,13,0.35)', fontFamily: "'Tenor Sans', sans-serif" }}>🔒 {def.xp} {t.achievements.xp}</span>
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
