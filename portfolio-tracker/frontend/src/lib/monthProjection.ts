// Projeção de gasto do mês financeiro corrente — algoritmo ÚNICO, usado pela
// Visão Geral (FinancesOverviewPage) e pela página Hoje. Antes essa lógica vivia
// só no componente da Visão Geral; foi extraída pra cá pra não ser reimplementada
// (e divergir) em cada lugar que precisa da previsão.
//
// Método: mediana das médias diárias de gasto dos últimos 3 meses, descontando
// os lumps recorrentes (aluguel, etc.) da taxa por dia pra não multiplicá-los por
// dia, e somando de volta só os recorrentes que ainda não foram lançados no ciclo.

export interface ProjectionMonth {
  month: string
  expenses: number
  by_envelope: { type?: string; categories?: { id: number; name: string; icon: string; actual: number }[] }[]
}

export interface ProjectionInput {
  months: ProjectionMonth[]
  month: string        // chave do mês financeiro corrente, YYYY-MM
  cycleDay: number     // dia de fechamento do ciclo (1 = mês calendário)
  today: Date
  totalBudgeted: number
  isCurrentMonth: boolean
}

export interface ProjectionResult {
  projected: number | null
  missingRecurrents: { id: number; name: string; icon: string; amount: number }[]
  missingTotal: number
  adjustedDailyAvg: number
  histDailyAvg: number
  daysElapsed: number
  daysTotal: number
  daysRemaining: number
  pastMonthsCount: number
}

const MS_DAY = 86400000

export function fmDateRange(ym: string, cd: number): { start: Date; end: Date } {
  const [y, mo] = ym.split('-').map(Number)
  if (cd <= 1) return { start: new Date(y, mo - 1, 1), end: new Date(y, mo, 0) }
  return { start: new Date(y, mo - 2, cd), end: new Date(y, mo - 1, cd - 1) }
}

export function projectMonthExpenses(input: ProjectionInput): ProjectionResult {
  const { months, month, cycleDay, today, totalBudgeted, isCurrentMonth } = input
  const currentMonthData = months.find(m => m.month === month) ?? { month, expenses: 0, by_envelope: [] }
  const totalExpenses = currentMonthData.expenses

  const fmDates = fmDateRange(month, cycleDay)
  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const startMs = new Date(fmDates.start.getFullYear(), fmDates.start.getMonth(), fmDates.start.getDate()).getTime()
  const endMs = new Date(fmDates.end.getFullYear(), fmDates.end.getMonth(), fmDates.end.getDate()).getTime()
  const daysTotal = Math.round((endMs - startMs) / MS_DAY) + 1
  const daysElapsed = isCurrentMonth ? Math.max(1, Math.round((todayMs - startMs) / MS_DAY) + 1) : daysTotal
  const daysRemaining = isCurrentMonth ? Math.max(0, daysTotal - daysElapsed) : 0

  // #1 Projeção resistente a outlier: mediana das médias diárias por mês
  const pastMonthsData = months.filter(m => m.month < month && m.expenses > 0).slice(-3)
  const perMonthStats = pastMonthsData.map(m => {
    const r = fmDateRange(m.month, cycleDay)
    const days = Math.round((r.end.getTime() - r.start.getTime()) / MS_DAY) + 1
    return { expenses: m.expenses, days, dailyAvg: m.expenses / days }
  })
  const sortedAvgs = [...perMonthStats].sort((a, b) => a.dailyAvg - b.dailyAvg)
  const histDailyAvg = sortedAvgs.length > 0 ? sortedAvgs[Math.floor(sortedAvgs.length / 2)].dailyAvg : 0
  const avgMonthDays = perMonthStats.length > 0 ? perMonthStats.reduce((s, m) => s + m.days, 0) / perMonthStats.length : 30

  // #2 Recorrentes: categorias presentes em TODOS os meses passados, estáveis e grandes
  const catHistMap = new Map<number, { amounts: number[]; name: string; icon: string }>()
  for (const pm of pastMonthsData) {
    for (const env of pm.by_envelope) {
      if (env.type === 'income') continue
      for (const cat of env.categories ?? []) {
        const prev = catHistMap.get(cat.id) ?? { amounts: [], name: cat.name, icon: cat.icon }
        catHistMap.set(cat.id, { ...prev, amounts: [...prev.amounts, cat.actual] })
      }
    }
  }
  const currentCatActuals = new Map<number, number>()
  for (const env of currentMonthData.by_envelope) {
    for (const cat of env.categories ?? []) currentCatActuals.set(cat.id, cat.actual)
  }
  const missingRecurrents: { id: number; name: string; icon: string; amount: number }[] = []
  let missingTotal = 0
  let recurringHistTotal = 0
  if (pastMonthsData.length > 0 && totalBudgeted > 0) {
    for (const [catId, hist] of catHistMap.entries()) {
      if (hist.amounts.length < pastMonthsData.length) continue // precisa aparecer em todo mês passado
      const sorted = [...hist.amounts].sort((a, b) => a - b)
      const minAmt = sorted[0]
      const maxAmt = sorted[sorted.length - 1]
      const medianAmt = sorted[Math.floor(sorted.length / 2)]
      if (maxAmt > minAmt * 3) continue // valores inconsistentes ≠ recorrente de verdade
      if (medianAmt < totalBudgeted * 0.20) continue // só itens fixos significativos
      recurringHistTotal += medianAmt
      if (isCurrentMonth) {
        const current = currentCatActuals.get(catId) ?? 0
        if (current < minAmt * 0.25) { // < 25% do menor mês histórico → ainda não lançado
          missingRecurrents.push({ id: catId, name: hist.name, icon: hist.icon, amount: Math.round(medianAmt) })
          missingTotal += medianAmt
        }
      }
    }
  }
  // Tira o lump recorrente inteiro da taxa diária (não só o que falta); missingTotal
  // soma de volta só o que ainda não foi lançado neste ciclo.
  const adjustedDailyAvg = Math.max(0, histDailyAvg - (avgMonthDays > 0 ? recurringHistTotal / avgMonthDays : 0))

  const projected = isCurrentMonth && (histDailyAvg > 0 || missingTotal > 0)
    ? Math.round(totalExpenses + missingTotal + adjustedDailyAvg * daysRemaining)
    : null

  return { projected, missingRecurrents, missingTotal, adjustedDailyAvg, histDailyAvg, daysElapsed, daysTotal, daysRemaining, pastMonthsCount: pastMonthsData.length }
}
