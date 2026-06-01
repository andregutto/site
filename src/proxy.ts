import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  const hostname = request.headers.get('host') ?? ''
  const pathname = request.nextUrl.pathname

  if (hostname.startsWith('sq.') && !pathname.startsWith('/tools')) {
    return NextResponse.redirect(new URL('/tools', request.url))
  }
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|.*\\..*).*)'],
}
