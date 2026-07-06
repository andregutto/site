// Série diária de comparação Carteira vs CDI/IBOV/S&P500 — algoritmo ÚNICO,
// usado pela página Performance (gráfico dos períodos diários) e pela Hoje (linha
// de 30d no card de patrimônio). Antes vivia embutido no PerformancePage; foi
// extraído pra cá pra não ser reimplementado e divergir.

import type { BenchmarkMonthly, DailyPerf } from './types'

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Interpola os fatores acumulados mensais dos benchmarks para um dia (linear no mês).
export function interpolateBenchmarkCumAtDate(
  bm: BenchmarkMonthly[], dateStr: string
): { cdi: number | null; ibov: number | null; sp500: number | null } {
  if (!bm.length) return { cdi: null, ibov: null, sp500: null }
  const ym = dateStr.substring(0, 7)
  const day = parseInt(dateStr.split('-')[2])
  const [y, m] = ym.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const t = day / daysInMonth
  const monthMap = new Map(bm.map(b => [b.month, b]))
  const prev = monthMap.get(addMonths(ym, -1))
  const cur = monthMap.get(ym)
  function interp(pv: number | null | undefined, cv: number | null | undefined): number | null {
    if (cv == null) return null
    const p = pv ?? cv
    return p + (cv - p) * t
  }
  return {
    cdi: interp(prev?.cdi_cum, cur?.cdi_cum),
    ibov: interp(prev?.ibov_cum, cur?.ibov_cum),
    sp500: interp(prev?.sp500_cum, cur?.sp500_cum),
  }
}

export interface ComparisonPoint {
  date: string
  portfolio: number
  cdi: number | null
  ibov: number | null
  sp500: number | null
}

// Retorno acumulado (Simple Dietz) da carteira e dos benchmarks, ponto a ponto,
// normalizados pelo primeiro dia do período. O último ponto = comparação do período.
export function dailyComparisonSeries(daily: DailyPerf[], benchmarks: BenchmarkMonthly[]): ComparisonPoint[] {
  const pts = daily.filter(pt => pt.total > 0)
  if (pts.length === 0) return []
  const periodStart = pts[0].total - (pts[0].contributions ?? 0)
  const baseBm = interpolateBenchmarkCumAtDate(benchmarks, pts[0].date)
  let cfCumul = 0
  return pts.map(pt => {
    cfCumul += (pt.contributions ?? 0)
    const denom = periodStart + 0.5 * cfCumul
    // periodStart 0 (nada antes da criação): base vira os aportes (0.5·cfCumul), igual ao resumo.
    const portfolio = denom > 0 ? Math.round(((pt.total - periodStart - cfCumul) / denom) * 10000) / 100 : 0
    const dayBm = interpolateBenchmarkCumAtDate(benchmarks, pt.date)
    const cdi = dayBm.cdi != null && baseBm.cdi != null && baseBm.cdi > 0 ? Math.round((dayBm.cdi / baseBm.cdi - 1) * 10000) / 100 : null
    const ibov = dayBm.ibov != null && baseBm.ibov != null && baseBm.ibov > 0 ? Math.round((dayBm.ibov / baseBm.ibov - 1) * 10000) / 100 : null
    const sp500 = dayBm.sp500 != null && baseBm.sp500 != null && baseBm.sp500 > 0 ? Math.round((dayBm.sp500 / baseBm.sp500 - 1) * 10000) / 100 : null
    return { date: pt.date, portfolio, cdi, ibov, sp500 }
  })
}
