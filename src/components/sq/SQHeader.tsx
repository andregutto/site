'use client'

import { Barlow_Condensed } from 'next/font/google'
import { useTranslation } from '@/lib/i18n'
import { LangSwitcher } from './LangSwitcher'

const barlow = Barlow_Condensed({ weight: ['900'], subsets: ['latin'] })
import { C, sans } from '@/lib/sq-design'

interface NavLink { href: string; label: string }

interface SQHeaderProps {
  links?: NavLink[]
  badge: string
}

export function SQHeader({ links = [], badge }: SQHeaderProps) {
  const { t } = useTranslation()
  return (
    <header style={{ background: C.paper }}>
      <div style={{
        maxWidth: 1300, margin: '0 auto',
        padding: '48px 48px 32px',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      }}>

        {/* ── Logo → sempre linka para /tools ── */}
        <a href="/tools" style={{ textDecoration: 'none', display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <span style={{ fontFamily: sans, letterSpacing: '0.6em', fontSize: 13, color: C.muted, marginLeft: 2 }}>
            {t('studio')}
          </span>
          <span className={barlow.className} style={{ fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.02em', fontSize: 52, lineHeight: 0.9, color: C.ink, marginTop: -2 }}>
            {t('quartier')}
          </span>
          <div style={{ width: '100%', height: '0.5px', background: C.ink, margin: '6px 0 4px' }} />
          <span style={{ fontFamily: sans, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 10, color: C.muted }}>
            {t('tagline')}
          </span>
        </a>

        {/* ── Nav direita ── */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 24, paddingBottom: 6 }}>
          {links.map(link => (
            <a key={link.href} href={link.href} style={{
              fontFamily: sans,
              fontSize: 13,
              color: C.ink,
              textDecoration: 'none',
              letterSpacing: '0.02em',
              borderBottom: `1px solid ${C.ink}`,
              paddingBottom: 2,
              lineHeight: 1,
              whiteSpace: 'nowrap',
            }}>
              {link.label}
            </a>
          ))}

          <span style={{
            fontFamily: sans,
            textTransform: 'uppercase',
            letterSpacing: '0.2em',
            fontSize: 10,
            color: C.ink,
            border: `0.5px solid ${C.ink}`,
            padding: '5px 12px',
            lineHeight: 1,
            whiteSpace: 'nowrap',
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
