import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
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
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|.*\\..*).*)'],
}
