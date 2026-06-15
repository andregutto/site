import { useState } from 'react'

const INSTITUTION_DOMAINS: Record<string, string> = {
  // Brasil
  'BANCO BTG PACTUAL S.A.':       'btgpactual.com',
  'BCO C6 S.A.':                  'c6bank.com.br',
  'C6 BANK':                      'c6bank.com.br',
  'XP INVESTIMENTOS CCTVM S/A':   'www.xpi.com.br',
  'XP INVESTIMENTOS':             'www.xpi.com.br',
  'XP INVESTMENTS':               'www.xpi.com.br',
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
  'ÓRAMA':                        'orama.com.br',
  'GENIAL':                       'genialinvestimentos.com.br',
  'VITREO':                       'vitreo.com.br',
  'KINEA':                        'kinea.com.br',
  'BANCO DO BRASIL':              'bb.com.br',
  'CAIXA':                        'caixa.gov.br',
  'BANCO SAFRA':                  'safra.com.br',
  'SICOOB':                       'sicoob.com.br',
  'SICREDI':                      'sicredi.com.br',
  'BANCO ORIGINAL':               'original.com.br',

  // Europa / global
  'BNP PARIBAS':                  'bnpparibas.com',
  'NATIXIS':                      'www.natixis.com',
  'SOCIÉTÉ GÉNÉRALE':             'societegenerale.com',
  'CRÉDIT AGRICOLE':              'credit-agricole.fr',
  'LCL':                          'lcl.fr',
  "CAISSE D'ÉPARGNE":             'caisse-epargne.fr',
  'BANQUE POPULAIRE':             'banquepopulaire.fr',
  'LA BANQUE POSTALE':            'labanquepostale.fr',
  'CRÉDIT MUTUEL':                'creditmutuel.fr',
  'CIC':                          'cic.fr',
  'HSBC FRANCE':                  'hsbc.fr',
  'ING FRANCE':                   'ing.fr',
  'BOURSORAMA':                   'boursorama.com',
  'FORTUNEO':                     'fortuneo.fr',
  'HELLO BANK!':                  'hellobank.fr',
  'MONABANQ':                     'monabanq.com',
  'REVOLUT':                      'revolut.com',
  'N26':                          'n26.com',
  'WISE':                         'wise.com',
  'TRADE REPUBLIC':               'traderepublic.com',
  'SCALABLE CAPITAL':             'scalable.capital',
  'LIGHTYEAR':                    'lightyear.com',
  'DEGIRO':                       'degiro.com',
  'SAXO BANK':                    'home.saxo',
  'SWISSQUOTE':                   'swissquote.com',
  'ETORO':                        'etoro.com',
  '212':                          'trading212.com',

  // Cripto
  'EXODUS':                       'exodus.com',
  'BINANCE':                      'binance.com',
  'COINBASE':                     'coinbase.com',
  'KRAKEN':                       'kraken.com',

  // EUA
  'INTERACTIVE BROKERS':          'interactivebrokers.com',
  'FIDELITY':                     'fidelity.com',
  'CHARLES SCHWAB':               'schwab.com',
  'TD AMERITRADE':                'tdameritrade.com',
  'MERRILL LYNCH':                'ml.com',
  'MORGAN STANLEY':               'morganstanley.com',
  'JPMORGAN CHASE':               'chase.com',
  'BANK OF AMERICA':              'bankofamerica.com',
  'WELLS FARGO':                  'wellsfargo.com',
  'CITIBANK':                     'citibank.com',
  'GOLDMAN SACHS':                'goldmansachs.com',
  'ROBINHOOD':                    'robinhood.com',
  'E*TRADE':                      'etrade.com',
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
  // Full-string containment in either direction: handles "ITAÚ UNIBANCO S.A."
  // (contains key "ITAÚ") and "BTG Pactual" (contained in key "BANCO BTG
  // PACTUAL S.A."). Matching only the first word would let any "Banco X"
  // collide with the first "BANCO ..." key found.
  const upper = name.toUpperCase()
  for (const [key, domain] of Object.entries(INSTITUTION_DOMAINS)) {
    if (upper.includes(key) || key.includes(upper)) return domain
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
        className="rounded-lg object-contain shrink-0 bg-white border border-[var(--arvo-border)]"
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
