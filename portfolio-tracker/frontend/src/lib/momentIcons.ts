import type { IconName } from '../components/icons'

// Drawn icons offered in the Moments "icon" picker (replaces the emoji set).
// Covers types of life/finance events (trip, celebration, purchase, milestone,
// health, study...), not generic UI actions (no gear/search/chevron/arrow/etc).
export const MOMENT_ICON_KEYS: IconName[] = [
  // viagem
  'plane', 'beach', 'mountain', 'luggage', 'globe',
  // festa & celebração
  'sparkle', 'party', 'cake', 'mask', 'music', 'gift', 'bell',
  // comida & consumo
  'utensils', 'cart',
  // casa & compra grande
  'home', 'building', 'key',
  // relacionamento & marco pessoal
  'ring', 'heart', 'graduation',
  // saúde & lazer
  'pill', 'trophy', 'gamepad', 'car',
  // finanças & metas
  'coin', 'wallet', 'bank', 'target', 'scale', 'seal', 'shield', 'doc',
  // crescimento (metáfora de virada/evolução)
  'seed', 'sprout', 'tree', 'wheat',
  // outros
  'scissors',
]

// Legacy emoji (previously stored in `moments.icon`) → new drawn-icon key.
const LEGACY_EMOJI_MAP: Record<string, IconName> = {
  '✨': 'sparkle',
  '✈️': 'plane',
  '🎉': 'party',
  '🎂': 'cake',
  '🏖️': 'beach',
  '🏔️': 'mountain',
  '🎭': 'mask',
  '🎵': 'music',
  '🍽️': 'utensils',
  '🏠': 'home',
  '💒': 'ring',
  '🎓': 'graduation',
  '🛒': 'cart',
  '⚽': 'trophy',
  '🎮': 'gamepad',
  '🚗': 'car',
  '💊': 'pill',
  '🎁': 'gift',
}

// Resolves a stored `icon` value (new key or legacy emoji) to a drawn icon.
export function resolveMomentIcon(icon: string): IconName {
  if ((MOMENT_ICON_KEYS as string[]).includes(icon)) return icon as IconName
  return LEGACY_EMOJI_MAP[icon] ?? 'sparkle'
}
