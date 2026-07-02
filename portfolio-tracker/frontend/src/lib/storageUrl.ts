// Supabase storage public URLs are built from the client's own base URL (window.location.origin
// in prod, see lib/supabase.ts), so whatever domain/alias happened to serve the app at upload time
// gets baked permanently into the saved URL. That's fine while the app is only ever accessed via
// the canonical domain, but a Vercel branch/preview deployment alias is ephemeral — once it's torn
// down, any photo uploaded through it 404/410s forever. Normalize to the canonical domain right
// before persisting so stored URLs never depend on which alias served the upload.
const CANONICAL_ORIGIN = 'https://arvo.andregutto.com'

export function normalizeStorageUrl(url: string): string {
  if (!import.meta.env.PROD) return url
  try {
    const u = new URL(url)
    if (u.origin === window.location.origin) {
      return CANONICAL_ORIGIN + u.pathname + u.search
    }
    return url
  } catch {
    return url
  }
}
