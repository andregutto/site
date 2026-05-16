import { useEffect, useRef } from 'react'
import type { AchievementDef } from '../lib/achievementDefs'
import Medal from './Medal'

interface Props {
  def: AchievementDef
  onClose: () => void
}

const COLORS = ['#C9A227', '#FFD700', '#2563EB', '#10B981', '#F472B6', '#67E8F9', '#FB923C']

function createParticle(container: HTMLDivElement) {
  const el = document.createElement('div')
  const size = Math.random() * 8 + 4
  const color = COLORS[Math.floor(Math.random() * COLORS.length)]
  const left = Math.random() * 100
  const delay = Math.random() * 0.6
  const duration = Math.random() * 1.5 + 1.5
  const rotate = Math.random() * 720 - 360

  el.style.cssText = `
    position:absolute;
    left:${left}%;
    top:-10px;
    width:${size}px;
    height:${size}px;
    background:${color};
    border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
    opacity:1;
    animation: confetti-fall ${duration}s ${delay}s ease-in forwards;
    transform: rotate(0deg);
    --rotate-end:${rotate}deg;
  `
  container.appendChild(el)
  setTimeout(() => el.remove(), (duration + delay) * 1000 + 100)
}

export default function CelebrationModal({ def, onClose }: Props) {
  const confettiRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!confettiRef.current) return
    const container = confettiRef.current
    for (let i = 0; i < 80; i++) {
      setTimeout(() => createParticle(container), i * 20)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(var(--rotate-end)); opacity: 0; }
        }
        @keyframes medal-spin {
          0%   { transform: rotateY(0deg) scale(0.5); opacity: 0; }
          40%  { transform: rotateY(360deg) scale(1.15); opacity: 1; }
          60%  { transform: rotateY(360deg) scale(0.95); }
          100% { transform: rotateY(360deg) scale(1); opacity: 1; }
        }
        @keyframes celebration-pop {
          0%   { transform: scale(0.7); opacity: 0; }
          70%  { transform: scale(1.05); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {/* Confetti container */}
      <div ref={confettiRef} className="fixed inset-0 pointer-events-none overflow-hidden" />

      {/* Modal */}
      <div
        className="relative bg-[#0A0F1E] border border-[#C9A227]/30 rounded-3xl px-10 py-10 text-center shadow-2xl"
        style={{ maxWidth: 360, animation: 'celebration-pop 0.5s ease-out forwards' }}
      >
        <p className="text-[#C9A227] text-xs font-bold uppercase tracking-widest mb-4">Conquista desbloqueada!</p>

        <div style={{ animation: 'medal-spin 1s ease-out forwards', display: 'inline-block' }}>
          <Medal def={def} earned animate size={120} />
        </div>

        <h2 className="text-white text-2xl font-bold mt-5">{def.name}</h2>
        <p className="text-gray-400 text-sm mt-1">{def.description}</p>

        <div className="mt-4 inline-flex items-center gap-2 bg-[#C9A227]/10 border border-[#C9A227]/30 rounded-full px-4 py-1.5">
          <span className="text-[#C9A227] font-bold text-lg">+{def.xp}</span>
          <span className="text-gray-400 text-sm">XP</span>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full bg-[#C9A227] hover:bg-[#b8911f] text-black font-bold py-2.5 rounded-xl transition-colors"
        >
          Incrível!
        </button>
      </div>
    </div>
  )
}
