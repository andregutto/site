'use client'

import { useState } from 'react'
import { Barlow_Condensed } from 'next/font/google'
import { C, sans, labelStyle } from '@/lib/sq-design'
import { destinoSeguro } from '@/lib/tools-auth'

const barlow = Barlow_Condensed({ weight: ['900'], subsets: ['latin'] })

const campo: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', fontFamily: sans, fontSize: 16,
  padding: '12px 14px', color: C.ink, background: '#fff',
  border: '1px solid #DCD6C8', borderRadius: 0, outline: 'none',
}

export default function ToolsLogin() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setErro(null)
    const r = await fetch('/api/tools-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: senha }),
    })
    if (!r.ok) {
      const { error } = await r.json().catch(() => ({ error: '' }))
      setErro(
        error === 'sem_acesso' ? 'Esta conta não tem acesso ao back office.'
        : error === 'ambiente_incompleto' ? 'Servidor sem chave de sessão configurada.'
        : 'E-mail ou senha incorretos.',
      )
      setEnviando(false)
      setSenha('')
      return
    }
    // `from` vem do proxy. Lido aqui em vez de useSearchParams pra não precisar
    // de Suspense numa página de um formulário.
    window.location.href = destinoSeguro(new URLSearchParams(window.location.search).get('from'))
  }

  return (
    <main style={{ minHeight: '100dvh', background: C.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <form onSubmit={entrar} style={{ width: '100%', maxWidth: 340 }}>
        <p style={{ ...labelStyle, color: C.muted, marginBottom: 6 }}>Studio Quartier</p>
        <h1 className={barlow.className} style={{ fontSize: 42, lineHeight: 1, letterSpacing: '-0.01em', textTransform: 'uppercase', color: C.ink, margin: '0 0 6px' }}>
          Back office
        </h1>
        <p style={{ fontFamily: sans, fontSize: 13.5, color: C.muted, margin: '0 0 20px' }}>
          Entre com a sua conta Alori.
        </p>

        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="E-mail"
          autoFocus
          autoComplete="username"
          style={{ ...campo, borderColor: erro ? '#8C1A1A' : '#DCD6C8' }}
        />
        <input
          type="password"
          value={senha}
          onChange={e => setSenha(e.target.value)}
          placeholder="Senha"
          autoComplete="current-password"
          style={{ ...campo, marginTop: 8, borderColor: erro ? '#8C1A1A' : '#DCD6C8' }}
        />

        <button
          type="submit"
          disabled={enviando || !email || !senha}
          style={{
            width: '100%', marginTop: 10, padding: '12px 14px', fontFamily: sans,
            fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
            color: C.paper, background: C.ink, border: 'none', borderRadius: 0,
            cursor: enviando || !email || !senha ? 'default' : 'pointer',
            opacity: enviando || !email || !senha ? 0.45 : 1,
          }}
        >
          {enviando ? 'Verificando' : 'Entrar'}
        </button>

        {erro && (
          <p style={{ fontFamily: sans, fontSize: 13, color: '#8C1A1A', marginTop: 10 }}>{erro}</p>
        )}
      </form>
    </main>
  )
}
