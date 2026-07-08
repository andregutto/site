import type { ReactNode, SVGProps } from 'react'

/* Arvo icon set (§ icons) — single stroke family: 16px grid, stroke 1.5,
   currentColor. Replaces emoji-as-iconography across the app; the nav icons
   inlined in AppLayout migrate here as screens are touched. */

const PATHS = {
  /* data & finance */
  'chart-bars': <><rect x="1" y="9" width="3" height="6" rx=".5" /><rect x="6.5" y="5.5" width="3" height="9.5" rx=".5" /><rect x="12" y="2" width="3" height="13" rx=".5" /></>,
  'chart-line': <path d="M1 12l4-4 3 3 7-7M11.5 4H15v3.5" />,
  pie: <><circle cx="8" cy="8" r="6.5" /><path d="M8 1.5V8l4.6 4.6" /></>,
  rows: <><rect x="1" y="1.5" width="14" height="3" rx=".5" /><rect x="1" y="6.5" width="14" height="3" rx=".5" /><rect x="1" y="11.5" width="14" height="3" rx=".5" /></>,
  coin: <><circle cx="8" cy="8" r="6.5" /><path d="M8 4.5v7M10 6.2c-.4-.7-1.1-1.1-2-1.1-1.2 0-2.1.7-2.1 1.7S6.8 8.2 8 8.4s2.2.7 2.2 1.7-.9 1.7-2.2 1.7c-.9 0-1.7-.4-2.1-1.1" /></>,
  wallet: <><rect x="1.5" y="3.5" width="13" height="10" rx="1.5" /><path d="M1.5 6.5H15M11.5 10h1.5" /></>,
  bank: <><path d="M1.5 6L8 2l6.5 4v1H1.5V6z" /><path d="M3 7v5M6.3 7v5M9.7 7v5M13 7v5M1.5 14h13" /></>,
  card: <><rect x="1" y="3" width="14" height="10" rx="1.5" /><path d="M1 6.5h14M4 10h2M9 10h3" /></>,
  scale: <path d="M8 2v12M4 14h8M4 6l-3 4h6L4 6zM12 4l-3 4h6l-3-4z" />,
  target: <><circle cx="8" cy="8" r="6.5" /><circle cx="8" cy="8" r="3" /><circle cx="8" cy="8" r=".75" fill="currentColor" stroke="none" /></>,

  /* places & things */
  building: <><rect x="3" y="1.5" width="10" height="13" rx=".5" /><path d="M6 4.5h1.5M8.5 4.5H10M6 7h1.5M8.5 7H10M6 9.5h1.5M8.5 9.5H10M6.5 14.5v-2.5h3v2.5" /></>,
  home: <path d="M1.5 7.5L8 2l6.5 5.5V14.5H10V10H6v4.5H1.5z" />,
  globe: <><circle cx="8" cy="8" r="6.5" /><path d="M1.5 8h13M8 1.5c1.8 1.7 2.8 4 2.8 6.5S9.8 12.8 8 14.5C6.2 12.8 5.2 10.5 5.2 8S6.2 3.2 8 1.5z" /></>,
  shield: <><path d="M8 1.5l5.5 2v4.2c0 3.4-2.2 5.8-5.5 6.8-3.3-1-5.5-3.4-5.5-6.8V3.5l5.5-2z" /><path d="M5.5 8l1.8 1.8L10.6 6" /></>,
  key: <><circle cx="5" cy="11" r="3.5" /><path d="M7.5 8.5L14 2M11.5 4.5L13.5 6.5M9.5 6.5l1.5 1.5" /></>,
  gear: <><circle cx="8" cy="8" r="2.5" /><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" /></>,
  file: <path d="M3 1.5h6.5L13 5v9.5H3zM9 1.5V5h4M5 8h6M5 11h4" />,
  seal: <><path d="M8 1.5l1.5 1.4 2-.4.6 2 2 .6-.4 2L15 8l-1.3 1.6.4 2-2 .6-.6 2-2-.4L8 15l-1.5-1.2-2 .4-.6-2-2-.6.4-2L1 8l1.3-1.9-.4-2 2-.6.6-2 2 .4L8 1.5z" /><path d="M5.8 8l1.6 1.6L10.5 6.3" /></>,
  ring: <><circle cx="8" cy="9.5" r="4.5" /><path d="M6 5.5L4.8 3.2 6.5 1.5h3l1.7 1.7L10 5.5" /></>,
  scissors: <><circle cx="3.5" cy="4" r="2" /><circle cx="3.5" cy="12" r="2" /><path d="M5.2 5.1L14 12.5M5.2 10.9L14 3.5" /></>,
  plane: <path d="M14.5 1.5L9.8 14.5l-2.6-5.7L1.5 6.2 14.5 1.5zM7.2 8.8l3.3-3.3" />,
  luggage: <><rect x="3" y="5" width="10" height="8.5" rx="1.5" /><path d="M6 5V3.5A1.5 1.5 0 017.5 2h1A1.5 1.5 0 0110 3.5V5M6 7.5v3.5M10 7.5v3.5" /></>,
  doc: <path d="M4 1.5h5.5L12 4v10.5H4V1.5ZM9.5 1.5V4H12M6 7h4M6 9.5h4M6 12h2.5" />,

  /* nature — brand metaphors */
  seed: <><ellipse cx="8" cy="9.5" rx="3" ry="4" /><path d="M2.5 14.5h11" /></>,
  sprout: <path d="M8 14.5V8M8 8c0-3 2-5 5.5-5C13.5 6 11.5 8 8 8zM8 9.5C8 7 6.5 5.5 3.5 5.5 3.5 8 5 9.5 8 9.5z" />,
  tree: <path d="M8 14.5v-4M8 10.5L5.5 8M8 10.5L10.5 8M8 10.5c-3.5 0-5.5-2-5.5-5 0-1.5.7-2.8 1.8-3.5C5 1.2 6.4.8 8 .8s3 .4 3.7 1.2c1.1.7 1.8 2 1.8 3.5 0 3-2 5-5.5 5z" />,
  wheat: <path d="M8 14.5V5M8 5c0-2 1.2-3.5 3-3.5 0 2-1.2 3.5-3 3.5zM8 5c0-2-1.2-3.5-3-3.5 0 2 1.2 3.5 3 3.5zM8 8.5c0-2 1.2-3.5 3-3.5 0 2-1.2 3.5-3 3.5zM8 8.5c0-2-1.2-3.5-3-3.5 0 2 1.2 3.5 3 3.5zM8 12c0-2 1.2-3.5 3-3.5 0 2-1.2 3.5-3 3.5zM8 12c0-2-1.2-3.5-3-3.5 0 2 1.2 3.5 3 3.5z" />,
  mountain: <path d="M1 13.5L6 4l3 5.5 2-3 4 7H1zM9.5 2.5h.01" />,

  /* moments & activities */
  sparkle: <><path d="M8 1.5c.6 3.2 2.5 5.1 5.5 5.5-3 .4-4.9 2.3-5.5 5.5-.6-3.2-2.5-5.1-5.5-5.5C5.5 6.6 7.4 4.7 8 1.5z" /><path d="M12.5 1.5v1.6M11.7 2.3h1.6" /></>,
  party: <><path d="M3 14.5L6.5 5l6 4-9.5 5.5z" /><circle cx="11" cy="2.5" r=".75" fill="currentColor" stroke="none" /><circle cx="13.8" cy="5.5" r=".6" fill="currentColor" stroke="none" /><circle cx="13.5" cy="2" r=".5" fill="currentColor" stroke="none" /></>,
  cake: <><rect x="2" y="8.5" width="12" height="5.5" rx="1" /><path d="M2 11.5h12" /><path d="M8 8.5V5.5" /><path d="M8 5.5c-.7 0-1.3-.6-1.3-1.4 0-.9.6-1.5 1.3-2.1.7.6 1.3 1.2 1.3 2.1 0 .8-.6 1.4-1.3 1.4z" /></>,
  beach: <><path d="M1.5 8a6.5 6.5 0 0113 0z" /><path d="M8 8v6.5M6 14.5h4" /></>,
  mask: <><path d="M2 6c0-2.5 2.5-4.5 6-4.5s6 2 6 4.5c0 3.5-2 6.5-4.5 8a3 3 0 01-3 0C4 12.5 2 9.5 2 6z" /><circle cx="5.7" cy="6.2" r=".7" fill="currentColor" stroke="none" /><circle cx="10.3" cy="6.2" r=".7" fill="currentColor" stroke="none" /><path d="M6 9.2c.6.7 1.3 1 2 1s1.4-.3 2-1" /></>,
  music: <><circle cx="4.5" cy="12.5" r="2" /><circle cx="11.5" cy="11" r="2" /><path d="M6.5 12.5V3.5l7-1.5V9.5" /></>,
  utensils: <><path d="M4 1.5v4.5a1.5 1.5 0 003 0V1.5M5.5 6v8.5" /><path d="M12.5 1.5c0 1.8-.5 3.2-2 4.3a1 1 0 00-.2 1.4l1.7 1.3v6" /></>,
  graduation: <><path d="M8 2L1 5.5l7 3.5 7-3.5L8 2z" /><path d="M4 7v3c0 1.4 1.8 2.5 4 2.5s4-1.1 4-2.5V7" /><path d="M14.5 5.5V10" /></>,
  cart: <><path d="M1.5 1.5h1.8l1.2 8.5h7.8l1.2-6H4" /><circle cx="6" cy="14" r="1.2" /><circle cx="11" cy="14" r="1.2" /></>,
  trophy: <><path d="M5 2h6v3.5a3 3 0 01-6 0V2z" /><path d="M5 3H3v1.5A2.5 2.5 0 005.3 7M11 3h2v1.5A2.5 2.5 0 0110.7 7" /><path d="M8 8.5v2.5M5.5 14.5h5M6.5 14.5V11h3v3.5" /></>,
  gamepad: <><rect x="1.5" y="5" width="13" height="6.5" rx="3" /><path d="M5 6.8v2.4M3.8 8h2.4" /><circle cx="11" cy="7.3" r=".6" fill="currentColor" stroke="none" /><circle cx="12.3" cy="9" r=".6" fill="currentColor" stroke="none" /></>,
  car: <><path d="M2 11.5V9l1.5-3.5h9L14 9v2.5" /><path d="M1.5 11.5h13" /><circle cx="4.5" cy="12.7" r="1.3" /><circle cx="11.5" cy="12.7" r="1.3" /></>,
  pill: <><path d="M3.5 12.5a4 4 0 010-5.7l5.3-5.3a4 4 0 015.7 5.7l-5.3 5.3a4 4 0 01-5.7 0z" /><path d="M6.3 5.7l4 4" /></>,
  gift: <><rect x="2" y="6.5" width="12" height="8" rx=".5" /><path d="M2 9.5h12M8 6.5v8" /><path d="M8 6.5c-1.6 0-3-1-3-2.5S6.1 1.8 7.2 2.5 8 4.5 8 6.5zM8 6.5c1.6 0 3-1 3-2.5S9.9 1.8 8.8 2.5 8 4.5 8 6.5z" /></>,
  heart: <path d="M8 13.5 3 8.7a3 3 0 114.2-4.2L8 5.3l.8-.8A3 3 0 1113 8.7l-5 4.8Z" />,

  /* time & flow */
  clock: <><circle cx="8" cy="8" r="6.5" /><path d="M8 4.5V8l2.5 1.5" /></>,
  repeat: <path d="M3 6.5a5 5 0 019-1.5M13 4.5v2h-2M13 9.5a5 5 0 01-9 1.5M3 11.5v-2h2" />,
  refresh: <path d="M13.5 8a5.5 5.5 0 11-1.6-3.9M13.5 1.5v3h-3" />,

  /* status & actions */
  alert: <><path d="M8 1.5l6.5 11.5H1.5L8 1.5z" /><path d="M8 6.5v3.5M8 12h.01" /></>,
  info: <><circle cx="8" cy="8" r="6.5" /><path d="M8 7.5V11M8 5h.01" /></>,
  check: <path d="M2.5 8.5L6 12l7.5-8" />,
  x: <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />,
  plus: <path d="M8 2.5v11M2.5 8h11" />,
  'chevron-down': <path d="M3.5 6l4.5 4.5L12.5 6" />,
  'arrow-up-right': <path d="M4 12L12 4M6 4h6v6" />,
  'arrow-down-right': <path d="M4 4l8 8M12 6v6H6" />,
  search: <><circle cx="7" cy="7" r="5" /><path d="M10.8 10.8L14.5 14.5" /></>,
  share: <><circle cx="12.5" cy="3.5" r="2" /><circle cx="3.5" cy="8" r="2" /><circle cx="12.5" cy="12.5" r="2" /><path d="M5.3 7.1l5.4-2.7M5.3 8.9l5.4 2.7" /></>,
  bell: <path d="M8 2a4 4 0 014 4c0 3 .8 4.2 1.5 5H2.5C3.2 10.2 4 9 4 6a4 4 0 014-4zM6.5 13.5a1.5 1.5 0 003 0" />,
  lock: <><rect x="3" y="7" width="10" height="7.5" rx="1" /><path d="M5.5 7V4.5a2.5 2.5 0 015 0V7" /></>,

  /* people */
  users: <><circle cx="5.5" cy="5" r="2.5" /><path d="M1 14v-1c0-2.2 2-4 4.5-4s4.5 1.8 4.5 4v1" /><circle cx="11.5" cy="6" r="2" /><path d="M10 8.3c1.9.4 3 1.8 3 3.5V13" /></>,
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof PATHS

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  size?: number
}

export function Icon({ name, size = 16, strokeWidth = 1.5, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}
