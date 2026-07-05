/* Outline icons for community categories and topic states, replacing the
   emoji set (💬🛟💡✈️📌🔒) to match the platform's icon language. */

const base = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.5,
  viewBox: '0 0 16 16',
}

// Extra outline icons selectable when creating categories in the admin panel.
export const ICON_KEYS = ['chat', 'help', 'idea', 'mountains', 'chart', 'home', 'luggage', 'coin', 'doc', 'heart'] as const
export type IconKey = typeof ICON_KEYS[number]

const SLUG_TO_KEY: Record<string, IconKey> = {
  geral: 'chat', suporte: 'help', sugestoes: 'idea', viagens: 'mountains',
}

export default function CategoryIcon({ slug, iconKey, size = 15 }: { slug?: string | null; iconKey?: string | null; size?: number }) {
  const key: string = iconKey || SLUG_TO_KEY[slug ?? ''] || 'chat'
  switch (key) {
    case 'help':
      return (
        <svg {...base} width={size} height={size}>
          <circle cx="8" cy="8" r="6.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M5.9 6.1c.35-.8 1.28-1.35 2.35-1.35 1.4 0 2.55.9 2.55 2 0 .93-.82 1.72-1.93 1.94-.36.07-.62.38-.62.75v.36M8 11.9h.01" />
        </svg>
      )
    case 'idea':
      return (
        <svg {...base} width={size} height={size}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 1.5a4 4 0 00-2 7.465V11h4V8.965A4 4 0 008 1.5ZM6.5 13h3M7 14.5h2" />
        </svg>
      )
    case 'mountains':
      return (
        <svg {...base} width={size} height={size}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M1 11.5l3-7 4 3 3-5 4 3" />
          <path strokeLinecap="round" d="M1 14.5h14" />
        </svg>
      )
    case 'chart':
      return (
        <svg {...base} width={size} height={size}>
          <path strokeLinecap="round" d="M2 13.5h12M3.5 13.5V8.5M7 13.5V5M10.5 13.5V6.5M14 13.5V3.5" />
        </svg>
      )
    case 'home':
      return (
        <svg {...base} width={size} height={size}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2 7.5 8 2.5l6 5M3.5 6.8V13.5h3.5v-3.5h2v3.5h3.5V6.8" />
        </svg>
      )
    case 'luggage':
      return (
        <svg {...base} width={size} height={size}>
          <rect x="3" y="5" width="10" height="8.5" rx="1.5" />
          <path strokeLinecap="round" d="M6 5V3.5A1.5 1.5 0 017.5 2h1A1.5 1.5 0 0110 3.5V5M6 7.5v3.5M10 7.5v3.5" />
        </svg>
      )
    case 'coin':
      return (
        <svg {...base} width={size} height={size}>
          <circle cx="8" cy="8" r="6" />
          <path strokeLinecap="round" d="M8 4.5v7M10 6c-.4-.7-1.1-1.1-2-1.1-1.2 0-2.1.7-2.1 1.7S6.8 8.2 8 8.4s2.2.7 2.2 1.7-.9 1.7-2.2 1.7c-.9 0-1.7-.4-2.1-1.1" />
        </svg>
      )
    case 'doc':
      return (
        <svg {...base} width={size} height={size}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 1.5h5.5L12 4v10.5H4V1.5ZM9.5 1.5V4H12M6 7h4M6 9.5h4M6 12h2.5" />
        </svg>
      )
    case 'heart':
      return (
        <svg {...base} width={size} height={size}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 13.5 3 8.7a3 3 0 114.2-4.2L8 5.3l.8-.8A3 3 0 1113 8.7l-5 4.8Z" />
        </svg>
      )
    case 'chat':
    default:
      return (
        <svg {...base} width={size} height={size}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2 2.5h12v8H6.5L3 13.5V10.5H2v-8Z" />
        </svg>
      )
  }
}

export function PinIcon({ size = 12 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5l4 4-2.2.7-2.6 2.6-.2 3.2-2.5-2.5L3 13.5l-.5-.5L6.5 9 4 6.5l3.2-.2 2.6-2.6.7-2.2Z" />
    </svg>
  )
}

export function LockIcon({ size = 12 }: { size?: number }) {
  return (
    <svg {...base} width={size} height={size}>
      <rect x="3" y="7" width="10" height="7" rx="1.2" />
      <path strokeLinecap="round" d="M5.5 7V5a2.5 2.5 0 015 0v2" />
    </svg>
  )
}
