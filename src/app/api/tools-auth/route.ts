import { NextResponse } from 'next/server'
import {
  ALORI_ANON_KEY, ALORI_SUPABASE_URL, COOKIE_TOOLS, DONO, DURACAO_MS,
  chaveDeSessao, emitirToken,
} from '@/lib/tools-auth'

/**
 * Emite (POST) e revoga (DELETE) o cookie do portão do back office.
 *
 * Fica FORA de `/api/sq` de propósito: o proxy fecha aquele prefixo inteiro, e
 * um endpoint de login atrás do próprio login não abriria nunca.
 *
 * A senha atravessa daqui pro Supabase do Alori e não é guardada nem logada.
 */

export async function POST(req: Request) {
  const chave = chaveDeSessao()
  if (!chave) {
    return NextResponse.json({ error: 'ambiente_incompleto' }, { status: 500 })
  }

  let email = '', password = ''
  try {
    const body = (await req.json()) as { email?: unknown; password?: unknown }
    email = String(body.email ?? '').trim()
    password = String(body.password ?? '')
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
  if (!email || !password) {
    return NextResponse.json({ error: 'faltou_dado' }, { status: 400 })
  }

  const r = await fetch(`${ALORI_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ALORI_ANON_KEY },
    body: JSON.stringify({ email, password }),
  })

  if (!r.ok) {
    // Atraso pequeno pra tornar tentativa em massa desagradável sem punir quem
    // só errou a senha.
    await new Promise(res => setTimeout(res, 400))
    return NextResponse.json({ error: 'credenciais' }, { status: 401 })
  }

  const dados = (await r.json()) as { user?: { id?: string } }
  // Ter conta no Alori não basta: só o dono entra.
  if (dados.user?.id !== DONO) {
    await new Promise(res => setTimeout(res, 400))
    return NextResponse.json({ error: 'sem_acesso' }, { status: 403 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_TOOLS, await emitirToken(chave, Date.now()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(DURACAO_MS / 1000),
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_TOOLS, '', { path: '/', maxAge: 0 })
  return res
}
