import { useState } from 'react'

const INSTITUTION_DOMAINS: Record<string, string> = {
  'BANCO BTG PACTUAL S.A.':       'btgpactual.com',
  'BCO C6 S.A.':                  'c6bank.com.br',
  'EXODUS':                       'exodus.com',
  'INTERACTIVE BROKERS':          'interactivebrokers.com',
  'NATIXIS':                      'natixis.com',
  'REVOLUT':                      'revolut.com',
  'XP INVESTIMENTOS CCTVM S/A':   'xpi.com.br',
  'XP INVESTIMENTOS':             'xpi.com.br',
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
}

const COLORS = [
  '#001A70','#10B981','#F59E0B','#EF4444','#8B5CF6',
  '#EC4899','#06B6D4','#F97316','#6366F1','#14B8A6',
]

function nameToColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return COLORS[Math.abs(hash) % COLORS.length]
}

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
  const [imgError, setImgError] = useState(false)
  const domain = getDomain(name)
  const initials = name.replace(/\bS[./]A\.?|CCTVM|LTDA\.?|BANCO|BCO\b/gi, '').trim().slice(0, 2).toUpperCase()
  const color = nameToColor(name)

  const style = { width: size, height: size, minWidth: size }

  if (domain && !imgError) {
    return (
      <img
        src={`https://logo.clearbit.com/${domain}`}
        alt={name}
        style={style}
        className="rounded-lg object-contain shrink-0 bg-white border border-gray-100"
        onError={() => setImgError(true)}
      />
    )
  }

  return (
    <div
      style={{ ...style, backgroundColor: color }}
      className="rounded-lg flex items-center justify-center text-white font-bold shrink-0"
      title={name}
    >
      <span style={{ fontSize: size * 0.35 }}>{initials}</span>
    </div>
  )
}
