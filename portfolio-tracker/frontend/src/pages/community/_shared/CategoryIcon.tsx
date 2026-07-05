/* Outline icons for community categories and topic states, replacing the
   emoji set (💬🛟💡✈️📌🔒) to match the platform's icon language. */

const base = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.5,
  viewBox: '0 0 16 16',
}

export default function CategoryIcon({ slug, size = 15 }: { slug?: string | null; size?: number }) {
  switch (slug) {
    case 'suporte':
      return (
        <svg {...base} width={size} height={size}>
          <circle cx="8" cy="8" r="6.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M5.9 6.1c.35-.8 1.28-1.35 2.35-1.35 1.4 0 2.55.9 2.55 2 0 .93-.82 1.72-1.93 1.94-.36.07-.62.38-.62.75v.36M8 11.9h.01" />
        </svg>
      )
    case 'sugestoes':
      return (
        <svg {...base} width={size} height={size}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 1.5a4 4 0 00-2 7.465V11h4V8.965A4 4 0 008 1.5ZM6.5 13h3M7 14.5h2" />
        </svg>
      )
    case 'viagens':
      return (
        <svg {...base} width={size} height={size}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M1 11.5l3-7 4 3 3-5 4 3" />
          <path strokeLinecap="round" d="M1 14.5h14" />
        </svg>
      )
    case 'geral':
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
