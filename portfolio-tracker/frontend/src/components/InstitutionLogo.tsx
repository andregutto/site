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

// Tokeniza em palavras (mantendo letras acentuadas, já que \b do regex do JS
// não lida bem com elas — "ITAÚ" quebraria o limite de palavra logo após o Ú).
function tokens(s: string): string[] {
  return s.toUpperCase().split(/[^A-ZÀ-ÖØ-Þ0-9]+/).filter(Boolean)
}

// Verifica se a sequência `needle` aparece contígua dentro de `haystack`.
function containsSeq(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    if (needle.every((t, j) => haystack[i + j] === t)) return true
  }
  return false
}

function getDomain(name: string): string | null {
  const upper = name.toUpperCase()
  // Correspondência exata sem diferenciar maiúsculas primeiro — "Interactive
  // Brokers" e "INTERACTIVE BROKERS" precisam resolver pro mesmo lugar,
  // senão só a grafia exata cai aqui e a outra vai pro loop de palavras
  // abaixo, que pode achar uma instituição errada.
  if (INSTITUTION_DOMAINS[upper]) return INSTITUTION_DOMAINS[upper]

  // Comparação por palavra inteira (não por substring crua) em ambas as
  // direções: cobre "ITAÚ UNIBANCO S.A." (contém a palavra "ITAÚ") e "BTG
  // Pactual" (contido como frase em "BANCO BTG PACTUAL S.A."). Substring
  // crua deixava chaves curtas como "INTER" (Banco Inter) coincidirem
  // dentro de nomes não relacionados como "INTERACTIVE BROKERS" ou um
  // "INTERA" digitado pela metade.
  const nameTokens = tokens(upper)
  for (const [key, domain] of Object.entries(INSTITUTION_DOMAINS)) {
    const keyTokens = tokens(key)
    if (containsSeq(nameTokens, keyTokens) || containsSeq(keyTokens, nameTokens)) return domain
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
