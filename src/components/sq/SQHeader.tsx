'use client'

import { Barlow_Condensed } from 'next/font/google'
import { useTranslation } from '@/lib/i18n'
import { LangSwitcher } from './LangSwitcher'
import { C, sans } from '@/lib/sq-design'

const barlow = Barlow_Condensed({ weight: ['900'], subsets: ['latin'] })

interface NavLink { href: string; label: string }

interface SQHeaderProps {
  links?: NavLink[]
  badge: string
}

export function SQHeader({ links = [], badge }: SQHeaderProps) {
  return (
    <header style={{ background: C.paper }}>
      <div style={{
        maxWidth: 1300, margin: '0 auto',
        padding: '16px 48px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>

        {/* ── Monograma ── */}
        <a href="/tools" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 14 }}>
          <span className={barlow.className} style={{
            fontWeight: 900, fontSize: 22, letterSpacing: '-0.01em', lineHeight: 1,
            color: C.paper, background: C.ink,
            padding: '6px 10px', display: 'inline-block',
          }}>
            SQ
          </span>
          <span style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', color: C.muted, textTransform: 'uppercase' }}>
            Studio Quartier
          </span>
        </a>

        {/* ── Nav direita ── */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {links.map(link => (
            <a key={link.href} href={link.href} style={{
              fontFamily: sans, fontSize: 12, fontWeight: 500,
              color: C.ink, textDecoration: 'none',
              letterSpacing: '0.02em', whiteSpace: 'nowrap',
              borderBottom: `1px solid ${C.ink}`, paddingBottom: 1,
            }}>
              {link.label}
            </a>
          ))}

          <span style={{
            fontFamily: sans, textTransform: 'uppercase',
            letterSpacing: '0.08em', fontSize: 10, fontWeight: 600,
            color: C.accent, border: `1px solid ${C.accent}`,
            padding: '4px 10px', lineHeight: 1, whiteSpace: 'nowrap',
          }}>
            {badge}
          </span>

          <LangSwitcher />
        </nav>
      </div>
      <div style={{ height: '0.5px', background: C.ink, marginLeft: 48, marginRight: 48 }} />
    </header>
  )
}
