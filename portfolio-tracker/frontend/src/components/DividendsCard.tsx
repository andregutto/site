import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { DividendSummary } from '../hooks/useDividends'
import { ArvoTooltip, CHART_AXIS_TICK, CHART_GRID_STROKE, CHART_SERIES } from './charts'

interface Props {
  divLoading: boolean
  divSummary: DividendSummary | null
  syncing: boolean
  convert: (v: number) => number
  fmt: (v: number, decimals?: number) => string
  currency: string
  intlLocale: string
  periodLabel: string
  td: Record<string, string>
  vertical?: boolean
  yieldPct?: number | null
}

export default function DividendsCard({ divLoading, divSummary, syncing, convert, fmt, currency, intlLocale, periodLabel, td, vertical, yieldPct }: Props) {
  const chart = divSummary && divSummary.by_month.length > 1 && (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={divSummary.by_month.map(m => ({ month: m.month, value: convert(m.total_brl) }))} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
        <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
        <XAxis
          dataKey="month"
          tick={CHART_AXIS_TICK}
          tickLine={false}
          axisLine={false}
          tickFormatter={(m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString(intlLocale, { month: 'short' }).replace('.', '')}
        />
        <YAxis hide />
        <Tooltip
          cursor={{ fill: 'var(--arvo-hover-bg)' }}
          content={
            <ArvoTooltip
              formatter={(v) => [new Intl.NumberFormat(intlLocale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(v), td.title ?? 'Dividendos']}
              labelFormatter={(m) => new Date(`${m}-01T00:00:00`).toLocaleDateString(intlLocale, { month: 'long', year: 'numeric' })}
            />
          }
        />
        <Bar dataKey="value" fill={CHART_SERIES.green} radius={[2, 2, 0, 0]} maxBarSize={vertical ? 18 : 28} />
      </BarChart>
    </ResponsiveContainer>
  )

  const topPayers = divSummary && (
    <div className={vertical ? undefined : 'flex-1 min-w-[160px]'}>
      <p className="text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--arvo-fg-soft)' }}>{td.topPayers ?? 'Maiores pagadores'}</p>
      <div className="space-y-1">
        {divSummary.by_asset.slice(0, 3).map(a => (
          <div key={a.asset_id} className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium truncate" style={{ color: 'var(--arvo-fg-muted)' }}>{a.code}</span>
            <div className="flex items-center gap-2">
              <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--arvo-border)' }}>
                <div className="h-full rounded-full" style={{ background: 'var(--arvo-green)', width: `${Math.min(100, (a.total_brl / divSummary.by_asset[0].total_brl) * 100)}%` }} />
              </div>
              <span className="text-xs w-16 text-right" style={{ color: 'var(--arvo-fg-muted)' }}>{fmt(convert(a.total_brl))}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className={`rounded-2xl p-5 ${vertical ? 'h-full flex flex-col' : ''}`} style={{ background: 'var(--arvo-surface)', border: '1px solid var(--arvo-border)' }}>
      <div className="flex items-center justify-between mb-3">
        <h2 style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 13, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--arvo-fg)' }}>{td.title ?? 'Dividendos'}</h2>
        {syncing && <span className="text-xs animate-pulse" style={{ color: 'var(--arvo-fg-soft)' }}>{td.autoSyncing ?? 'Atualizando...'}</span>}
      </div>
      {divLoading ? (
        <div className="h-14 flex items-center justify-center">
          <div className="text-xs animate-pulse" style={{ color: 'var(--arvo-fg-soft)' }}>{td.syncing ?? 'Carregando...'}</div>
        </div>
      ) : divSummary && divSummary.total_brl > 0 ? (
        vertical ? (
          <div className="flex flex-col gap-4 flex-1">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <p className="text-xs uppercase tracking-wide mb-0.5" style={{ color: 'var(--arvo-fg-soft)' }}>{td.totalReceived ?? 'Total recebido'}</p>
                <p className="text-xl font-bold" style={{ color: 'var(--arvo-green)' }}>{fmt(convert(divSummary.total_brl))}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--arvo-fg-soft)' }}>{periodLabel}</p>
              </div>
              {yieldPct != null && (
                <div className="shrink-0 text-right">
                  <p className="text-xs uppercase tracking-wide mb-0.5" style={{ color: 'var(--arvo-fg-soft)' }}>{td.yieldLabel ?? 'Yield'}</p>
                  <p className="text-xl font-bold" style={{ color: 'var(--arvo-fg)' }}>{yieldPct.toFixed(1)}%</p>
                </div>
              )}
            </div>
            {topPayers}
            {chart && <div className="flex-1 min-h-[120px]">{chart}</div>}
          </div>
        ) : (
          <div className="flex flex-wrap gap-4 items-start">
            <div className="shrink-0">
              <p className="text-xs uppercase tracking-wide mb-0.5" style={{ color: 'var(--arvo-fg-soft)' }}>{td.totalReceived ?? 'Total recebido'}</p>
              <p className="text-xl font-bold" style={{ color: 'var(--arvo-green)' }}>{fmt(convert(divSummary.total_brl))}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--arvo-fg-soft)' }}>{periodLabel}</p>
            </div>
            {yieldPct != null && (
              <div className="shrink-0">
                <p className="text-xs uppercase tracking-wide mb-0.5" style={{ color: 'var(--arvo-fg-soft)' }}>{td.yieldLabel ?? 'Yield'}</p>
                <p className="text-xl font-bold" style={{ color: 'var(--arvo-fg)' }}>{yieldPct.toFixed(1)}%</p>
              </div>
            )}
            {topPayers}
            {chart && <div className="flex-1 min-w-[140px] h-20">{chart}</div>}
          </div>
        )
      ) : (
        <p className="text-sm" style={{ color: 'var(--arvo-fg-soft)' }}>{td.noData ?? 'Nenhum dividendo no período'}</p>
      )}
    </div>
  )
}
