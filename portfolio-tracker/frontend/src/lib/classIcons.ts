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

// ~20 drawn icons offered in the Classes "icon" picker (replaces the 30-emoji grid).
export const CLASS_ICON_KEYS: IconName[] = [
  'sprout', 'tree', 'wheat', 'mountain',
  'building', 'home', 'bank', 'globe',
  'coin', 'wallet', 'card', 'scale',
  'shield', 'target', 'key', 'gear',
  'chart-bars', 'chart-line', 'pie', 'rows',
]

// Legacy emoji (previously stored in `asset_classes.icon`) → new drawn-icon key.
const LEGACY_EMOJI_MAP: Record<string, IconName> = {
  '📊': 'chart-bars',
  '📈': 'chart-line',
  '📉': 'chart-line',
  '🏦': 'bank',
  '🏢': 'building',
  '🏠': 'home',
  '🌍': 'globe',
  '🌎': 'globe',
  '🪙': 'coin',
  '💰': 'wallet',
  '💎': 'coin',
  '🛢️': 'mountain',
  '🌾': 'wheat',
  '🥇': 'seal',
  '🏭': 'building',
  '💵': 'wallet',
  '🚀': 'arrow-up-right',
  '⚡': 'target',
  '🛡️': 'shield',
  '💼': 'card',
  '🏪': 'building',
  '🏗️': 'building',
  '🎯': 'target',
  '🌊': 'globe',
  '📋': 'file',
  '🔑': 'key',
  '⚙️': 'gear',
  '🌱': 'sprout',
  '🏅': 'seal',
  '🧩': 'pie',
}

// Resolves a stored `icon` value (new key, legacy emoji, or null) to a drawn icon.
// Returns null when the value is unrecognized, so callers can show the `◆` fallback.
export function resolveClassIcon(icon: string | null, name: string): IconName | null {
  if (icon == null) return getClassIcon(name)
  if ((CLASS_ICON_KEYS as string[]).includes(icon)) return icon as IconName
  return LEGACY_EMOJI_MAP[icon] ?? null
}
