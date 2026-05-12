import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

type Mode = 'login' | 'register' | 'forgot'

export default function LoginPage() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode]         = useState<Mode>('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd]   = useState(false)
  const [error, setError]       = useState('')
  const [info, setInfo]         = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setInfo('')
    setLoading(true)
    try {
      if (mode === 'login') {
        await signIn(email, password)
      } else if (mode === 'register') {
        await signUp(email, password)
        setInfo('Verifique seu email para confirmar o cadastro.')
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (err) throw err
        setInfo('Email de redefinicao enviado. Verifique sua caixa de entrada.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  const submitLabel = loading
    ? 'Aguarde...'
    : mode === 'login' ? 'Entrar'
    : mode === 'register' ? 'Criar conta'
    : 'Enviar email'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">

        {/* Branding */}
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <img src="/favicon.svg" alt="Logo" className="w-12 h-12" />
          </div>
          <h1 className="text-2xl font-bold text-[#001A70]">Portfolio Tracker</h1>
          <p className="text-gray-500 text-sm">Acompanhe seus investimentos globais</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-5">

          {/* Mode tabs (login/register only) */}
          {mode !== 'forgot' && (
            <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
              {(['login', 'register'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setError(''); setInfo('') }}
                  className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                    mode === m ? 'bg-white shadow-sm text-[#001A70]' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {m === 'login' ? 'Entrar' : 'Criar conta'}
                </button>
              ))}
            </div>
          )}

          {mode === 'forgot' && (
            <div>
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setInfo('') }}
                className="text-xs text-[#001A70] hover:underline flex items-center gap-1"
              >
                ← Voltar ao login
              </button>
              <p className="text-sm text-gray-500 mt-2">
                Digite seu email e enviaremos um link para redefinir sua senha.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20 focus:border-[#001A70]"
                placeholder="seu@email.com"
              />
            </div>

            {mode !== 'forgot' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#001A70]/20 focus:border-[#001A70]"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                    tabIndex={-1}
                  >
                    {showPwd ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setError(''); setInfo('') }}
                    className="text-xs text-gray-400 hover:text-[#001A70] mt-1 block"
                  >
                    Esqueceu a senha?
                  </button>
                )}
              </div>
            )}

            {error && (
              <p className="text-sm px-3 py-2 rounded-lg bg-red-50 text-red-700">{error}</p>
            )}
            {info && (
              <p className="text-sm px-3 py-2 rounded-lg bg-blue-50 text-blue-700">{info}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#001A70] text-white py-2.5 rounded-lg font-medium text-sm hover:bg-[#002494] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {submitLabel}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400">
          <a href="https://andregutto.com" target="_blank" rel="noopener noreferrer" className="hover:text-[#001A70] transition-colors">andregutto.com</a>
          {' · '}portfolio.andregutto.com · v1.0
        </p>
      </div>
    </div>
  )
}
