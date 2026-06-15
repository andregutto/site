import { useState } from 'react'

const INSTITUTION_DOMAINS: Record<string, string> = {
  'BANCO BTG PACTUAL S.A.':       'btgpactual.com',
  'BCO C6 S.A.':                  'c6bank.com.br',
  'EXODUS':                       'exodus.com',
  'INTERACTIVE BROKERS':          'interactivebrokers.com',
  'NATIXIS':                      'www.natixis.com',
  'REVOLUT':                      'revolut.com',
  'XP INVESTIMENTOS CCTVM S/A':   'www.xpi.com.br',
  'XP INVESTIMENTOS':             'www.xpi.com.br',
  'NU INVEST':                    'nuinvest.com.br',
  'NUBANK':                       'nubank.com.br',
  'INTER':                        'inter.co',
  'ITAÚ':                         'itau.com.br',
  'BRADESCO':                     'bradesco.com.br',
  'SANTANDER':                    'santander.com.br',
  'RICO':                         'rico.com.vc',
  'CLEAR':                        'clear.com.br',
  'MODAL':                        'modal.com.br',
  'WARREN':                       'warren.com.br',
  'AVENUE':                       'avenue.us',
  'BNP PARIBAS':                  'bnpparibas.com',
}

// Clearbit tem qualidade bem melhor (logo de marca em alta resolução), então
// vai primeiro; Google Favicons (menor resolução) só entra como fallback
// quando o Clearbit não tem o domínio cadastrado, antes de cair nas iniciais.
const LOGO_SOURCES = [
  (domain: string) => `https://logo.clearbit.com/${domain}`,
  (domain: string) => `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
]

function getDomain(name: string): string | null {
  if (INSTITUTION_DOMAINS[name]) return INSTITUTION_DOMAINS[name]
  // Try partial match
  const upper = name.toUpperCase()
  for (const [key, domain] of Object.entries(INSTITUTION_DOMAINS)) {
    if (upper.includes(key) || key.includes(upper.split(' ')[0])) return domain
  }
  return null
}

export default function InstitutionLogo({ name, size = 32 }: { name: string; size?: number }) {
  const [sourceIdx, setSourceIdx] = useState(0)
  const domain = getDomain(name)
  const initials = name.replace(/\bS[./]A\.?|CCTVM|LTDA\.?|BANCO|BCO\b/gi, '').trim().slice(0, 2).toUpperCase()

  const style = { width: size, height: size, minWidth: size }

  if (domain && sourceIdx < LOGO_SOURCES.length) {
    return (
      <img
        key={sourceIdx}
        src={LOGO_SOURCES[sourceIdx](domain)}
        alt={name}
        style={style}
        className="rounded-lg object-contain shrink-0 bg-white border border-[var(--arvo-border)] p-1"
        onError={() => setSourceIdx(i => i + 1)}
      />
    )
  }

  return (
    <div
      style={{ ...style, background: 'var(--arvo-black)', color: 'var(--arvo-gold)' }}
      className="rounded-lg flex items-center justify-center font-semibold shrink-0"
      title={name}
    >
      <span style={{ fontSize: size * 0.35 }}>{initials}</span>
    </div>
  )
}
