import type { IconName } from '../components/icons'

// Maps an asset-class name to a drawn icon (replaces the 📊🏢 emoji set).
const CLASS_ICON_RULES: [RegExp, IconName][] = [
  [/ações?\s*brasil|brazil|b3/i, 'chart-bars'],
  [/exterior|eua|usa|intl|internacional/i, 'globe'],
  [/fii|imobiliário|imobiliario/i, 'building'],
  [/cripto|crypto|bitcoin/i, 'coin'],
  [/renda\s*fixa|fixed|tesouro|cdb|lci|lca/i, 'bank'],
  [/previdên|previdencia|pgbl|vgbl/i, 'shield'],
  [/imóveis|imoveis|real\s*estate/i, 'home'],
  [/commodit/i, 'mountain'],
  [/etf/i, 'chart-bars'],
  [/caixa|cash/i, 'wallet'],
]

export function getClassIcon(name: string): IconName {
  for (const [re, icon] of CLASS_ICON_RULES) if (re.test(name)) return icon
  return 'pie'
}
