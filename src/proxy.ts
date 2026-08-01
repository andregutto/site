import { NextRequest, NextResponse } from 'next/server'
import { COOKIE_TOOLS, chaveDeSessao, ehPublico, tokenValido } from '@/lib/tools-auth'

/**
 * Duas responsabilidades, nesta ordem:
 *
 * 1. Roteamento por hostname — `sq.andregutto.com` só serve `/sq`, `/tools` e
 *    `/api`; o resto volta pra `/sq`.
 * 2. Portão do back office — `/tools` e `/api/sq` exigem sessão.
 *
 * Em Next 16 isto substitui `middleware.ts`; os dois arquivos não podem
 * coexistir (o build falha dizendo pra usar só `proxy.ts`).
 */
export async function proxy(request: NextRequest) {
  const hostname = request.nextUrl.hostname
  const pathname = request.nextUrl.pathname

  if (hostname === 'sq.andregutto.com') {
    if (pathname === '/' || pathname === '') {
      return NextResponse.redirect(new URL('/sq', request.url))
    }
    if (!pathname.startsWith('/tools') && !pathname.startsWith('/sq') && !pathname.startsWith('/api')) {
      return NextResponse.redirect(new URL('/sq', request.url))
    }
  }

  const protegido = pathname.startsWith('/tools') || pathname.startsWith('/api/sq')
  if (!protegido || ehPublico(pathname)) return

  const chave = chaveDeSessao()
  // Sem chave de assinatura, fecha. Variável faltando não pode reabrir a porta.
  const ok = chave
    ? await tokenValido(request.cookies.get(COOKIE_TOOLS)?.value, chave, Date.now())
    : false
  if (ok) return

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const login = request.nextUrl.clone()
  login.pathname = '/tools/login'
  login.search = `?from=${encodeURIComponent(pathname + request.nextUrl.search)}`
  return NextResponse.redirect(login)
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|.*\\..*).*)'],
}
