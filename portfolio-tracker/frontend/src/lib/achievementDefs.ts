export interface AchievementDef {
  key: string
  name: string
  description: string
  xp: number
  gradient: [string, string]
  ringColor: string
}

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  { key: 'first_step',     name: 'Primeiro Passo',       description: 'Criar conta',                              xp: 10,  gradient: ['#001A70','#C9A227'], ringColor: '#C9A227' },
  { key: 'identity',       name: 'Identidade',           description: 'Completar perfil',                         xp: 15,  gradient: ['#4C1D95','#2563EB'], ringColor: '#818CF8' },
  { key: 'first_seed',     name: 'Primeira Semente',     description: 'Registrar primeiro aporte',                xp: 20,  gradient: ['#064E3B','#34D399'], ringColor: '#6EE7B7' },
  { key: 'global_roots',   name: 'Raízes Globais',       description: 'Ter ativo em moeda estrangeira',           xp: 25,  gradient: ['#0C4A6E','#F59E0B'], ringColor: '#FCD34D' },
  { key: 'builder',        name: 'Construtor',           description: 'Primeiro marco de patrimônio',             xp: 30,  gradient: ['#92400E','#F59E0B'], ringColor: '#FCD34D' },
  { key: 'five_digits',    name: 'Cinco Dígitos',        description: 'Portfólio acima de 10 mil',                xp: 50,  gradient: ['#1E3A5F','#06B6D4'], ringColor: '#67E8F9' },
  { key: 'six_digits',     name: 'Seis Dígitos',         description: 'Portfólio acima de 100 mil',               xp: 75,  gradient: ['#2E1065','#C9A227'], ringColor: '#E2C17A' },
  { key: 'quarter_million',name: 'Quarto de Milhão',     description: 'Portfólio acima de 250 mil',               xp: 100, gradient: ['#1E3A5F','#8B5CF6'], ringColor: '#C4B5FD' },
  { key: 'half_million',   name: 'Meio Milhão',          description: 'Portfólio acima de 500 mil',               xp: 125, gradient: ['#1C2E4A','#C9A227'], ringColor: '#FDE68A' },
  { key: 'million_club',   name: 'Clube do Milhão',      description: 'Portfólio acima de 1 milhão',              xp: 150, gradient: ['#1C1917','#D4AF37'], ringColor: '#D4AF37' },
  { key: 'three_million',  name: 'Três Milhões',         description: 'Portfólio acima de 3 milhões',             xp: 200, gradient: ['#312E81','#6366F1'], ringColor: '#A5B4FC' },
  { key: 'five_million',   name: 'Cinco Milhões',        description: 'Portfólio acima de 5 milhões',             xp: 300, gradient: ['#134E4A','#0D9488'], ringColor: '#2DD4BF' },
  { key: 'ten_million',    name: 'Dez Milhões',          description: 'Portfólio acima de 10 milhões',            xp: 500, gradient: ['#4C0519','#F43F5E'], ringColor: '#FB7185' },
  { key: 'diversified',    name: 'Diversificado',        description: 'Ativos em 3 classes diferentes',           xp: 30,  gradient: ['#1E1B4B','#DB2777'], ringColor: '#F472B6' },
  { key: 'crypto_native',  name: 'Crypto Nativo',        description: 'Ter cripto na carteira',                   xp: 20,  gradient: ['#18181B','#D97706'], ringColor: '#FCD34D' },
  { key: 'global_investor',name: 'Investidor Global',    description: 'Ativos em 3 moedas/países diferentes',     xp: 35,  gradient: ['#075985','#7DD3FC'], ringColor: '#BAE6FD' },
  { key: 'expat',          name: 'Expatriado',           description: 'Contas em 2 moedas diferentes',            xp: 30,  gradient: ['#14532D','#1D4ED8'], ringColor: '#93C5FD' },
  { key: 'pension',        name: 'Previdência Garantida',description: 'Ter previdência cadastrada',                xp: 20,  gradient: ['#1E3A5F','#94A3B8'], ringColor: '#CBD5E1' },
  { key: 'brick_by_brick', name: 'Tijolo por Tijolo',    description: 'Ter imóvel físico cadastrado',              xp: 30,  gradient: ['#7C2D12','#D4A574'], ringColor: '#FBBF24' },
  { key: 'fii_investor',  name: 'Fundo Imobiliário',   description: 'Ter FII na carteira',                      xp: 20,  gradient: ['#134E4A','#2DD4BF'], ringColor: '#5EEAD4' },
  { key: 'discipline',     name: 'Disciplina',           description: 'Aportes por 3 meses consecutivos',         xp: 40,  gradient: ['#064E3B','#10B981'], ringColor: '#34D399' },
  { key: 'consistency',    name: 'Consistência',         description: 'Aportes por 6 meses consecutivos',         xp: 60,  gradient: ['#78350F','#F59E0B'], ringColor: '#FCD34D' },
  { key: 'historian',      name: 'Historiador',          description: '1 ano completo de histórico',              xp: 75,  gradient: ['#44200E','#B45309'], ringColor: '#D97706' },
  { key: 'balancer',       name: 'Equilibrista',         description: 'Configurar metas de balanceamento',        xp: 20,  gradient: ['#1E3A5F','#64748B'], ringColor: '#94A3B8' },
  { key: 'tax_citizen',    name: 'Cidadão Fiscal',       description: 'Gerar primeiro relatório de IR',           xp: 40,  gradient: ['#1E3A5F','#B45309'], ringColor: '#D97706' },
  { key: 'multicurrency',  name: 'Multimoeda',           description: 'Ativos em BRL, EUR e USD',                 xp: 35,  gradient: ['#1E3A5F','#059669'], ringColor: '#34D399' },
  // Finance module
  { key: 'fin_first_txn',      name: 'Controle Financeiro',   description: 'Registrar a primeira transação de finanças',       xp: 15, gradient: ['#0F172A','#6366F1'], ringColor: '#A5B4FC' },
  { key: 'fin_csv_import',     name: 'Importador',            description: 'Importar extrato via CSV pela primeira vez',       xp: 20, gradient: ['#0F4C75','#38BDF8'], ringColor: '#7DD3FC' },
  { key: 'fin_first_account',  name: 'Conta Ativa',           description: 'Criar a primeira conta de finanças',               xp: 15, gradient: ['#134E4A','#0D9488'], ringColor: '#5EEAD4' },
  { key: 'fin_budget_ready',   name: 'Orçamento Pronto',      description: 'Configurar envelopes e categorias de orçamento',   xp: 25, gradient: ['#78350F','#F59E0B'], ringColor: '#FCD34D' },
  { key: 'fin_first_moment',   name: 'Memória Guardada',      description: 'Criar o primeiro Momento financeiro',              xp: 20, gradient: ['#4C1D95','#EC4899'], ringColor: '#F9A8D4' },
  { key: 'fin_freedom',        name: 'Visionário',            description: 'Criar um plano de liberdade financeira',           xp: 30, gradient: ['#1E3A5F','#C9A227'], ringColor: '#FDE68A' },
  { key: 'fin_hundred_txn',    name: 'Historiador Financeiro',description: 'Registrar mais de 100 transações',                 xp: 40, gradient: ['#1F2937','#9CA3AF'], ringColor: '#D1D5DB' },
  { key: 'fin_categorized',    name: 'Organizado',            description: 'Categorizar mais de 50 transações',                xp: 35, gradient: ['#14532D','#22C55E'], ringColor: '#86EFAC' },
]

export const LEVELS = [
  { name: 'Semente',    emoji: '🌱', minXp: 0,    maxXp: 100  },
  { name: 'Crescimento',emoji: '🌿', minXp: 101,  maxXp: 300  },
  { name: 'Expansão',   emoji: '🌳', minXp: 301,  maxXp: 600  },
  { name: 'Solidez',    emoji: '🏔️', minXp: 601,  maxXp: 1000 },
  { name: 'Liberdade',  emoji: '🚀', minXp: 1001, maxXp: Infinity },
]

export function getLevel(xp: number) {
  return LEVELS.find(l => xp >= l.minXp && xp <= l.maxXp) ?? LEVELS[0]
}

export function getNextLevel(xp: number) {
  const idx = LEVELS.findIndex(l => xp >= l.minXp && xp <= l.maxXp)
  return idx < LEVELS.length - 1 ? LEVELS[idx + 1] : null
}

export function getLevelProgress(xp: number): number {
  const level = getLevel(xp)
  if (level.maxXp === Infinity) return 100
  const range = level.maxXp - level.minXp
  const pos   = xp - level.minXp
  return Math.min(100, Math.round((pos / range) * 100))
}

export function getTotalXp(earnedKeys: string[]): number {
  return ACHIEVEMENT_DEFS
    .filter(a => earnedKeys.includes(a.key))
    .reduce((sum, a) => sum + a.xp, 0)
}

export const ACHIEVEMENT_MAP = Object.fromEntries(ACHIEVEMENT_DEFS.map(a => [a.key, a]))
