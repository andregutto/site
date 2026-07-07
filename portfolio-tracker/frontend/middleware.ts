// Vercel Edge Middleware — serve meta tags dinâmicas (og:title/og:image) só
// pros crawlers de rede social (WhatsApp, Facebook, Twitter/X, LinkedIn,
// Telegram, Slack, Discord) quando alguém compartilha o link público de um
// recurso. Pra qualquer outra visita (pessoa de verdade, qualquer outro
// path), não faz nada — a SPA carrega normal via routes do vercel.json.
//
// Por quê: o app é um SPA puro (sem SSR), então o index.html estático é a
// única coisa que um crawler de rede social vê — por isso hoje o preview de
// QUALQUER link (recurso, viagem, momento) mostra sempre o título/imagem
// genéricos do site, nunca o conteúdo específico. Isso resolve só o caso de
// Recursos (o mais valioso, é o link que vai nas descrições de vídeo); o
// mesmo padrão pode ser estendido pra viagens/momentos compartilhados depois.

export const config = {
  matcher: '/resources/:slug*',
}

const BOT_UA_RE = /facebookexternalhit|Facebot|Twitterbot|WhatsApp|Slackbot|LinkedInBot|TelegramBot|Discordbot|Pinterest|redditbot|vkShare|SkypeUriPreview|Googlebot/i

const FALLBACK_IMAGE = '/brand/imagery/arvo-fallback-recurso.jpg'
const FALLBACK_DESCRIPTION = 'Recurso gratuito do arvo — consolide seus investimentos, controle gastos e organize suas viagens, tudo num só lugar.'

// Capas de recurso sobem em tamanho grande (uploads reais chegam a passar de
// 2MB) — WhatsApp/a maioria dos crawlers rejeita og:image acima de ~300KB
// silenciosamente (o preview simplesmente não aparece, sem erro nenhum).
// Reescreve pro endpoint de transformação de imagem do Supabase Storage
// (troca /object/public/ por /render/image/public/ + query de resize), que
// devolve uma versão ~90KB já no tamanho padrão de OG image (1200x630).
function ogImageUrl(rawUrl: string): string {
  const transformed = rawUrl.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')
  if (transformed === rawUrl) return rawUrl // não é uma URL do Supabase Storage — usa como está
  return `${transformed}?width=1200&height=630&resize=cover&quality=75`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export default async function middleware(request: Request) {
  const ua = request.headers.get('user-agent') ?? ''
  if (!BOT_UA_RE.test(ua)) return // visita normal — segue pro SPA de sempre

  const url = new URL(request.url)
  const slug = url.pathname.replace(/^\/resources\//, '').split('/')[0]
  if (!slug) return

  try {
    const apiRes = await fetch(`${url.origin}/api/resources/public/${slug}`)
    if (!apiRes.ok) return // recurso não existe ou não publicado — SPA cuida do 404

    const resource = await apiRes.json() as {
      title: string
      description: string | null
      preview_image_url: string | null
    }

    const title = escapeHtml(`${resource.title} — arvo`)
    const description = escapeHtml(resource.description || FALLBACK_DESCRIPTION)
    const image = resource.preview_image_url
      ? ogImageUrl(resource.preview_image_url.startsWith('http') ? resource.preview_image_url : `${url.origin}${resource.preview_image_url}`)
      : `${url.origin}${FALLBACK_IMAGE}`

    const html = `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="UTF-8" />
<title>${title}</title>
<meta name="description" content="${description}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="arvo" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:image" content="${image}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:url" content="${escapeHtml(url.href)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${image}" />
</head><body></body></html>`

    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
  } catch {
    return // qualquer erro — deixa a SPA normal assumir
  }
}
