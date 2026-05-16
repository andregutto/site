import React from 'react'
import type { AchievementDef } from '../lib/achievementDefs'

interface MedalProps {
  def: AchievementDef
  earned: boolean
  size?: number
  animate?: boolean
}

const ICONS: Record<string, (c: string) => React.ReactElement> = {
  first_step: (c) => (
    <g fill={c} fillOpacity={0.95}>
      <rect x="44" y="50" width="22" height="30" rx="2" fill="none" stroke={c} strokeWidth="2.5"/>
      <rect x="46" y="52" width="18" height="26" rx="1" fill={c} fillOpacity={0.15}/>
      <circle cx="62" cy="66" r="2.5"/>
      <rect x="44" y="45" width="22" height="7" rx="2"/>
      <path d="M56 78 L56 90" stroke={c} strokeWidth="3" strokeLinecap="round"/>
      <rect x="50" y="88" width="12" height="3" rx="1.5"/>
      <path d="M66 64 L74 56 L74 78 L66 80 Z" fillOpacity={0.4}/>
      <path d="M67 56 L74 50 L74 56 Z" fillOpacity={0.25}/>
    </g>
  ),
  identity: (c) => (
    <g fill={c} fillOpacity={0.95}>
      <circle cx="60" cy="52" r="9"/>
      <path d="M42 84 Q42 68 60 68 Q78 68 78 84" fill={c} fillOpacity={0.8}/>
      <path d="M68 57 L73 63 L80 53" fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="74" cy="58" r="8" fill={c} fillOpacity={0.2} stroke={c} strokeWidth="1.5"/>
    </g>
  ),
  first_seed: (c) => (
    <g fill={c} fillOpacity={0.95}>
      <path d="M60 88 L60 58" stroke={c} strokeWidth="3" strokeLinecap="round"/>
      <path d="M60 70 Q50 60 42 62 Q44 74 60 70" fillOpacity={0.9}/>
      <path d="M60 63 Q70 50 80 52 Q78 66 60 63" fillOpacity={0.9}/>
      <path d="M55 88 Q60 84 65 88" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round"/>
      <ellipse cx="60" cy="90" rx="6" ry="3" fillOpacity={0.4}/>
    </g>
  ),
  global_roots: (c) => (
    <g fill="none" stroke={c} strokeWidth="2">
      <circle cx="60" cy="65" r="18" fill={c} fillOpacity={0.12}/>
      <ellipse cx="60" cy="65" rx="9" ry="18"/>
      <line x1="42" y1="65" x2="78" y2="65"/>
      <line x1="42" y1="58" x2="78" y2="58"/>
      <line x1="42" y1="72" x2="78" y2="72"/>
      <path d="M52 48 Q57 55 60 47" strokeWidth="1.5" fill={c} fillOpacity={0.4} stroke="none"/>
      <path d="M68 48 Q65 55 72 47" strokeWidth="1.5" fill={c} fillOpacity={0.4} stroke="none"/>
    </g>
  ),
  builder: (c) => (
    <g fill={c} fillOpacity={0.95}>
      <rect x="44" y="58" width="32" height="8" rx="1.5"/>
      <rect x="44" y="68" width="32" height="8" rx="1.5"/>
      <rect x="44" y="78" width="32" height="8" rx="1.5"/>
      <rect x="46" y="60" width="6" height="4" rx="0.5" fill="none" stroke={c} strokeWidth="1" fillOpacity={0}/>
      <rect x="57" y="60" width="6" height="4" rx="0.5" fill="none" stroke={c} strokeWidth="1" fillOpacity={0}/>
      <rect x="68" y="60" width="6" height="4" rx="0.5" fill="none" stroke={c} strokeWidth="1" fillOpacity={0}/>
      <text x="60" y="56" textAnchor="middle" fontSize="12" fontWeight="bold" fill={c}>R$</text>
    </g>
  ),
  five_digits: (c) => (
    <g fill={c}>
      <path d="M40 80 L52 65 L62 70 L75 48 L80 45" fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      <polygon points="75,40 82,48 68,48" fillOpacity={0.9}/>
      <path d="M40 82 L80 82" stroke={c} strokeWidth="2" strokeLinecap="round" fillOpacity={0.4} fill="none"/>
    </g>
  ),
  six_digits: (c) => (
    <g fill={c} fillOpacity={0.95}>
      <path d="M60 85 L55 70 L45 65 L55 60 L60 45 L65 60 L75 65 L65 70 Z"/>
      <path d="M60 80 L56 70 L48 67 L56 63 L60 52 L64 63 L72 67 L64 70 Z" fill="none" stroke={c} strokeWidth="1" fillOpacity={0.3}/>
      <circle cx="60" cy="65" r="5" fillOpacity={0.3} fill="white"/>
      <path d="M52 90 L68 90" stroke={c} strokeWidth="3" strokeLinecap="round" fill="none"/>
    </g>
  ),
  million_club: (c) => (
    <g fill={c} fillOpacity={0.95}>
      <path d="M60 45 L47 58 L51 75 L60 82 L69 75 L73 58 Z"/>
      <path d="M60 50 L50 60 L53 73 L60 78 L67 73 L70 60 Z" fill="white" fillOpacity={0.2}/>
      <line x1="47" y1="58" x2="73" y2="58" stroke="white" strokeWidth="1.5" fill="none"/>
      <line x1="51" y1="75" x2="69" y2="75" stroke="white" strokeWidth="1" fill="none"/>
      <line x1="55" y1="52" x2="52" y2="72" stroke="white" strokeWidth="0.8" fillOpacity={0.5} fill="none"/>
      <line x1="65" y1="52" x2="68" y2="72" stroke="white" strokeWidth="0.8" fillOpacity={0.5} fill="none"/>
    </g>
  ),
  diversified: (c) => (
    <g>
      <path d="M60 65 L60 44 A21 21 0 0 1 78 76 Z" fill={c} fillOpacity={0.9}/>
      <path d="M60 65 L78 76 A21 21 0 0 1 40 72 Z" fill={c} fillOpacity={0.6}/>
      <path d="M60 65 L40 72 A21 21 0 0 1 60 44 Z" fill={c} fillOpacity={0.4}/>
      <circle cx="60" cy="65" r="7" fill="none" stroke={c} strokeWidth="8" strokeOpacity={0.15}/>
    </g>
  ),
  crypto_native: (c) => (
    <g fill={c} fillOpacity={0.95}>
      <text x="60" y="74" textAnchor="middle" fontSize="28" fontWeight="bold" fill={c} fontFamily="serif">₿</text>
      <circle cx="60" cy="65" r="20" fill="none" stroke={c} strokeWidth="1.5" strokeOpacity={0.3}/>
    </g>
  ),
  global_investor: (c) => (
    <g fill={c} fillOpacity={0.95}>
      <path d="M40 72 L72 48 L75 55 L55 65 L65 85 L60 88 Z"/>
      <path d="M72 48 L80 46 L78 54 Z"/>
      <circle cx="48" cy="78" r="4" fillOpacity={0.5}/>
      <circle cx="58" cy="72" r="3" fillOpacity={0.4}/>
      <circle cx="68" cy="66" r="2.5" fillOpacity={0.3}/>
    </g>
  ),
  expat: (c) => (
    <g fill={c} fillOpacity={0.95}>
      <rect x="42" y="62" width="36" height="24" rx="4"/>
      <rect x="52" y="57" width="16" height="8" rx="3" fill={c} fillOpacity={0.7}/>
      <rect x="42" y="62" width="36" height="6" rx="0" fill="white" fillOpacity={0.15}/>
      <rect x="42" y="68" width="36" height="6" rx="0" fill="white" fillOpacity={0.1}/>
      <circle cx="51" cy="74" r="4" fill="white" fillOpacity={0.7}/>
      <circle cx="69" cy="74" r="4" fill="white" fillOpacity={0.5}/>
      <text x="51" y="77" textAnchor="middle" fontSize="5" fontWeight="bold" fill={c}>BR</text>
      <text x="69" y="77" textAnchor="middle" fontSize="5" fontWeight="bold" fill={c}>EU</text>
    </g>
  ),
  pension: (c) => (
    <g fill={c} fillOpacity={0.95}>
      <path d="M60 48 Q40 55 40 70 Q40 80 60 85 Q80 80 80 70 Q80 55 60 48 Z" fill="none" stroke={c} strokeWidth="2.5"/>
      <path d="M50 73 Q50 78 60 82 Q70 78 70 73" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"/>
      <line x1="60" y1="82" x2="60" y2="88" stroke={c} strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      <line x1="54" y1="88" x2="66" y2="88" stroke={c} strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      <circle cx="60" cy="65" r="6" fill={c} fillOpacity={0.3}/>
    </g>
  ),
  brick_by_brick: (c) => (
    <g fill={c} fillOpacity={0.95}>
      <path d="M60 47 L80 65 L76 65 L76 85 L44 85 L44 65 L40 65 Z"/>
      <rect x="48" y="70" width="10" height="15" rx="1" fill="white" fillOpacity={0.2}/>
      <rect x="62" y="70" width="10" height="15" rx="1" fill="white" fillOpacity={0.2}/>
      <rect x="48" y="65" width="24" height="6" fill="white" fillOpacity={0.1}/>
      <path d="M60 47 L80 65 L40 65 Z" fillOpacity={0.7}/>
    </g>
  ),
  discipline: (c) => (
    <g fill={c} fillOpacity={0.95}>
      <rect x="42" y="52" width="36" height="33" rx="4" fill={c} fillOpacity={0.2} stroke={c} strokeWidth="2"/>
      <rect x="42" y="52" width="36" height="9" rx="4"/>
      <line x1="51" y1="71" x2="55" y2="75" stroke={c} strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      <line x1="55" y1="75" x2="63" y2="67" stroke={c} strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      <line x1="63" y1="71" x2="67" y2="75" stroke={c} strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      <line x1="67" y1="75" x2="75" y2="67" stroke={c} strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      <line x1="48" y1="80" x2="56" y2="80" stroke={c} strokeWidth="2" strokeLinecap="round" fill="none"/>
      <line x1="52" y1="48" x2="52" y2="56" stroke={c} strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      <line x1="68" y1="48" x2="68" y2="56" stroke={c} strokeWidth="2.5" strokeLinecap="round" fill="none"/>
    </g>
  ),
  consistency: (c) => (
    <g fill={c} fillOpacity={0.95}>
      <ellipse cx="48" cy="65" rx="8" ry="5.5" fill="none" stroke={c} strokeWidth="3"/>
      <ellipse cx="60" cy="65" rx="8" ry="5.5" fill="none" stroke={c} strokeWidth="3"/>
      <ellipse cx="72" cy="65" rx="8" ry="5.5" fill="none" stroke={c} strokeWidth="3"/>
      <ellipse cx="54" cy="75" rx="8" ry="5.5" fill="none" stroke={c} strokeWidth="3"/>
      <ellipse cx="66" cy="75" rx="8" ry="5.5" fill="none" stroke={c} strokeWidth="3"/>
      <ellipse cx="60" cy="55" rx="8" ry="5.5" fill="none" stroke={c} strokeWidth="3"/>
    </g>
  ),
  historian: (c) => (
    <g fill={c} fillOpacity={0.95}>
      <path d="M44 50 Q44 46 48 46 L60 46 L60 84 Q56 82 48 84 Q44 84 44 80 Z" fillOpacity={0.7}/>
      <path d="M60 46 L72 46 Q76 46 76 50 L76 80 Q76 84 72 84 L60 84 Z" fillOpacity={0.9}/>
      <line x1="63" y1="58" x2="73" y2="58" stroke="white" strokeWidth="1.5" fill="none"/>
      <line x1="63" y1="63" x2="73" y2="63" stroke="white" strokeWidth="1.5" fill="none"/>
      <line x1="63" y1="68" x2="70" y2="68" stroke="white" strokeWidth="1.5" fill="none"/>
      <path d="M65 72 L68 79 L71 73" fill="none" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
    </g>
  ),
  balancer: (c) => (
    <g fill={c} fillOpacity={0.95}>
      <line x1="60" y1="50" x2="60" y2="86" stroke={c} strokeWidth="3" strokeLinecap="round" fill="none"/>
      <line x1="44" y1="64" x2="76" y2="64" stroke={c} strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      <circle cx="44" cy="72" r="6" fill="none" stroke={c} strokeWidth="2"/>
      <circle cx="76" cy="72" r="6" fill="none" stroke={c} strokeWidth="2"/>
      <path d="M44 64 L38 72 Q44 78 50 72 Z" fillOpacity={0.7}/>
      <path d="M76 64 L70 72 Q76 78 82 72 Z" fillOpacity={0.7}/>
      <circle cx="60" cy="52" r="4" fillOpacity={0.6}/>
      <line x1="54" y1="86" x2="66" y2="86" stroke={c} strokeWidth="3" strokeLinecap="round" fill="none"/>
    </g>
  ),
  tax_citizen: (c) => (
    <g fill={c} fillOpacity={0.95}>
      <rect x="44" y="46" width="32" height="40" rx="3" fill={c} fillOpacity={0.2} stroke={c} strokeWidth="2"/>
      <line x1="50" y1="58" x2="70" y2="58" stroke={c} strokeWidth="2" fill="none"/>
      <line x1="50" y1="64" x2="70" y2="64" stroke={c} strokeWidth="2" fill="none"/>
      <line x1="50" y1="70" x2="62" y2="70" stroke={c} strokeWidth="2" fill="none"/>
      <circle cx="68" cy="76" r="8" fill={c} fillOpacity={0.9}/>
      <path d="M64 76 L67 79 L73 73" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </g>
  ),
  multicurrency: (c) => (
    <g fill={c} fillOpacity={0.95}>
      <circle cx="50" cy="65" r="13" fill={c} fillOpacity={0.5} stroke={c} strokeWidth="1.5"/>
      <circle cx="60" cy="65" r="13" fill={c} fillOpacity={0.65} stroke={c} strokeWidth="1.5"/>
      <circle cx="70" cy="65" r="13" fill={c} fillOpacity={0.5} stroke={c} strokeWidth="1.5"/>
      <text x="44" y="69" textAnchor="middle" fontSize="9" fontWeight="bold" fill="white">R$</text>
      <text x="60" y="69" textAnchor="middle" fontSize="9" fontWeight="bold" fill="white">€</text>
      <text x="76" y="69" textAnchor="middle" fontSize="9" fontWeight="bold" fill="white">$</text>
    </g>
  ),
}

export default function Medal({ def, earned, size = 88, animate = false }: MedalProps) {
  const uid = def.key
  const [g1, g2] = def.gradient
  const icon = ICONS[def.key]?.('white')

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      style={{
        filter: earned ? 'none' : 'grayscale(100%) opacity(0.35)',
        transition: 'filter 0.4s ease',
      }}
    >
      <defs>
        <radialGradient id={`bg-${uid}`} cx="38%" cy="35%" r="65%">
          <stop offset="0%" stopColor={g1} stopOpacity="0.8"/>
          <stop offset="100%" stopColor={g2} stopOpacity="1"/>
        </radialGradient>
        <radialGradient id={`shine-${uid}`} cx="35%" cy="28%" r="50%">
          <stop offset="0%" stopColor="white" stopOpacity="0.28"/>
          <stop offset="100%" stopColor="white" stopOpacity="0"/>
        </radialGradient>
        <linearGradient id={`ring-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={def.ringColor} stopOpacity="0.9"/>
          <stop offset="50%" stopColor="white" stopOpacity="0.6"/>
          <stop offset="100%" stopColor={def.ringColor} stopOpacity="0.7"/>
        </linearGradient>
        {earned && (
          <filter id={`glow-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        )}
      </defs>

      {/* Outer glow ring when earned */}
      {earned && (
        <circle cx="60" cy="60" r="59" fill="none" stroke={def.ringColor} strokeWidth="2" strokeOpacity="0.35"/>
      )}

      {/* Main circle */}
      <circle cx="60" cy="60" r="55" fill={`url(#bg-${uid})`}/>

      {/* Ring border */}
      <circle cx="60" cy="60" r="55" fill="none" stroke={`url(#ring-${uid})`} strokeWidth="3"/>

      {/* Icon */}
      <g filter={earned ? `url(#glow-${uid})` : undefined}>
        {icon}
      </g>

      {/* Shine overlay */}
      <circle cx="60" cy="60" r="55" fill={`url(#shine-${uid})`}/>

      {/* Animate ring for new achievement */}
      {animate && earned && (
        <circle cx="60" cy="60" r="57" fill="none" stroke={def.ringColor} strokeWidth="4" strokeOpacity="0.7">
          <animate attributeName="r" from="55" to="65" dur="0.6s" repeatCount="1"/>
          <animate attributeName="stroke-opacity" from="0.8" to="0" dur="0.6s" repeatCount="1"/>
        </circle>
      )}
    </svg>
  )
}
