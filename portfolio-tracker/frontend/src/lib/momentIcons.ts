import type { IconName } from '../components/icons'

// 18 drawn icons offered in the Moments "icon" picker (replaces the emoji set).
export const MOMENT_ICON_KEYS: IconName[] = [
  'sparkle', 'plane', 'party', 'cake', 'beach', 'mountain',
  'mask', 'music', 'utensils', 'home', 'ring', 'graduation',
  'cart', 'trophy', 'gamepad', 'car', 'pill', 'gift',
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
