/**
 * Portão do back office (`/tools` e `/api/sq`).
 *
 * Verificado em 01/08/2026: as duas superfícies respondiam HTTP 200 sem
 * nenhuma autenticação, e `supabase-sq.ts` usa a service_role key, que ignora
 * RLS por definição. O que segurava a porta era um acidente — o Supabase de
 * produção estava inacessível ("fetch failed"), então as rotas de dado
 * quebravam antes de responder. No minuto em que a conexão voltasse, o CRM
 * inteiro (prospects, contatos, valores de contrato, faturas) ficaria público.
 *
 * ## Quem entra
 *
 * O login é o **do Alori**: o André digita o mesmo e-mail e senha de lá. Não há
 * senha nova, cadastro, nem variável de ambiente pra criar (era o pedido dele:
 * "não quero entrar no Vercel").
 *
 * A senha nunca é guardada nem registrada aqui — vai do navegador pro nosso
 * servidor e do nosso servidor pro Supabase do Alori, que responde se confere.
 *
 * **Ter conta no Alori não basta:** só o UUID em `DONO` passa. Sem isso,
 * qualquer pessoa que se cadastrasse no Alori entraria no CRM.
 *
 * ## Como a sessão se sustenta
 *
 * Depois do Supabase confirmar, emitimos cookie próprio assinado, e o portão
 * valida só o cookie — sem ida ao Supabase a cada request. A chave da
 * assinatura é a `SQ_SUPABASE_SERVICE_ROLE_KEY`, que já existe no ambiente:
 * segredo de verdade, nunca sai do servidor, e não exige configurar nada novo.
 * Faltando ela, o portão FECHA.
 *
 * Usa só Web Crypto porque isto roda no proxy (Edge runtime).
 */

export const COOKIE_TOOLS = 'sq_tools'

/** 30 dias. Sessão longa de propósito: o incômodo do relogin é o que faz
 *  alguém desligar a proteção. */
export const DURACAO_MS = 30 * 24 * 60 * 60 * 1000

/** Projeto Supabase do Alori. A anon key é pública por construção — o próprio
 *  frontend do Alori a entrega a cada navegador. Não é segredo e por isso pode
 *  viver aqui, num repositório público. */
export const ALORI_SUPABASE_URL = 'https://bkgpivxpzuzedezxtknd.supabase.co'
export const ALORI_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrZ3BpdnhwenV6ZWRlenh0a25kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MDYyMzcsImV4cCI6MjA5NDA4MjIzN30.UOnKYP6Sa8Gcq_O1yvGX0s0puo4AiL8ZhDU17nzHR10'

/** Único usuário do Alori autorizado no back office. */
export const DONO = '453bc770-0cea-4c88-b72f-babf9e50437e'

/** Chave de assinatura do cookie. Ausente → ninguém entra. */
export function chaveDeSessao(): string | undefined {
  return process.env.SQ_SUPABASE_SERVICE_ROLE_KEY
}

const enc = new TextEncoder()

async function assinar(payload: string, chave: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(chave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return base64url(new Uint8Array(sig))
}

function base64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Comparação de tempo constante: não vaza quantos caracteres bateram. */
function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Token = `<expiraEm>.<hmac(expiraEm)>`. A validade vai assinada junto, então
 *  não dá pra esticar a sessão editando o cookie. */
export async function emitirToken(chave: string, agora: number): Promise<string> {
  const expira = String(agora + DURACAO_MS)
  return `${expira}.${await assinar(expira, chave)}`
}

export async function tokenValido(
  token: string | undefined, chave: string, agora: number,
): Promise<boolean> {
  if (!token) return false
  const corte = token.indexOf('.')
  if (corte < 1) return false
  const expira = token.slice(0, corte)
  const sig = token.slice(corte + 1)
  if (!/^\d+$/.test(expira) || Number(expira) < agora) return false
  return iguais(sig, await assinar(expira, chave))
}

/**
 * Caminhos que continuam públicos, e por quê:
 *
 * - `/tools/login` — o próprio portão.
 * - `/tools/briefing/[token]` — é o formulário que o CLIENTE preenche; ele não
 *   tem login, tem o token do link. Fechar aqui quebra o fluxo de briefing.
 * - `/api/sq/briefings` — é o que aquela página chama (GET e gravação).
 * - `/api/sq/invoices/auto-generate` — cron do Vercel, já protegido por
 *   `CRON_SECRET` no próprio handler.
 */
export const PUBLICOS = [
  '/tools/login',
  '/tools/briefing',
  '/api/sq/briefings',
  '/api/sq/invoices/auto-generate',
]

export function ehPublico(pathname: string): boolean {
  return PUBLICOS.some(p => pathname === p || pathname.startsWith(p + '/'))
}

/** Só aceita destino interno do back office. Sem isto, `?from=` vira redirect
 *  aberto e o portão de login passa a servir de trampolim pra fora. */
export function destinoSeguro(from: string | null): string {
  if (!from || !from.startsWith('/tools') || from.startsWith('//')) return '/tools'
  return from
}
