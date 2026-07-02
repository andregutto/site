// Supabase storage public URLs are built from the client's own base URL (window.location.origin
// in prod, see lib/supabase.ts — routed through the /sb proxy), so whatever domain/alias happened
// to serve the app at upload time gets baked permanently into the saved URL. Two failure modes seen
// in practice: (1) a Vercel branch/preview deployment alias is ephemeral — once torn down, any photo
// uploaded through it 404/410s forever; (2) some corporate networks block the /sb proxy path on our
// own domain specifically (while allowing the raw *.supabase.co storage domain through). Normalizing
// to the direct Supabase project URL avoids both: it's stable regardless of which alias served the
// upload, and it's the one host confirmed to pass through a firewall that blocked the /sb proxy.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined

export function normalizeStorageUrl(url: string): string {
  if (!import.meta.env.PROD || !SUPABASE_URL) return url
  try {
    const u = new URL(url)
    const sbPathMatch = u.pathname.match(/^\/sb(\/.*)$/)
    if (u.origin === window.location.origin && sbPathMatch) {
      return SUPABASE_URL + sbPathMatch[1] + u.search
    }
    return url
  } catch {
    return url
  }
}
