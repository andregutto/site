'use client'

import Link from 'next/link'
import { Barlow_Condensed } from 'next/font/google'
import { usePathname } from 'next/navigation'
import { LangSwitcher } from './LangSwitcher'
import { C, sans } from '@/lib/sq-design'

const barlow = Barlow_Condensed({ weight: ['900'], subsets: ['latin'] })

const NAV = [
  { href: '/tools/prospect/historique', label: 'Historique',  match: (p: string) => p.startsWith('/tools/prospect/historique') },
  { href: '/tools/prospect',            label: 'Prospection', match: (p: string) => p.startsWith('/tools/prospect') && !p.includes('historique') },
  { href: '/tools/clients',             label: 'CRM',         match: (p: string) => p.startsWith('/tools/clients') },
  { href: '/tools/calendrier',          label: 'Calendrier',  match: (p: string) => p === '/tools/calendrier' },
  { href: '/tools/finances',            label: 'Finances',    match: (p: string) => p.startsWith('/tools/finances') },
  { href: '/tools/services',            label: 'Services',    match: (p: string) => p.startsWith('/tools/services') },
]

export function SQHeader() {
  const pathname = usePathname()

  return (
    <header style={{ background: C.paper }}>
      <div style={{
        maxWidth: 1300, margin: '0 auto',
        padding: '14px 48px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>

        {/* ── Monograma → /tools ── */}
        <Link href="/tools" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
          <span className={barlow.className} style={{
            fontWeight: 900, fontSize: 20, letterSpacing: '-0.01em', lineHeight: 1,
            color: C.paper, background: C.ink, padding: '6px 9px', display: 'inline-block',
          }}>
            SQ
          </span>
          <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: C.muted, textTransform: 'uppercase' }}>
            Studio Quartier
          </span>
        </Link>

        {/* ── Nav fixa ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {NAV.map(link => {
            const active = link.match(pathname)
            return (
              <Link key={link.href} href={link.href} style={{
                fontFamily: sans, fontSize: 12, fontWeight: active ? 700 : 500,
                color: active ? C.paper : C.ink,
                textDecoration: 'none', whiteSpace: 'nowrap',
                letterSpacing: '0.04em',
                padding: '6px 14px',
                background: active ? C.ink : 'transparent',
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = C.warm }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
              >
                {link.label}
              </Link>
            )
          })}

          <div style={{ width: '0.5px', height: 18, background: C.ink, opacity: 0.2, margin: '0 10px' }} />
          <LangSwitcher />
        </div>
      </div>
      <div style={{ height: '0.5px', background: C.ink, marginLeft: 48, marginRight: 48 }} />
    </header>
  )
}
