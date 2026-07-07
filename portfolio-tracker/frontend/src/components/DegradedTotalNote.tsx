import { useI18n } from '../contexts/I18nContext'

/* Pílula de aviso mostrada junto a qualquer montante de portfólio quando o
   backend sinaliza `degraded` em /portfolio/value: alguma fonte de preço
   falhou e um ou mais ativos entraram com valor de fallback, então o total
   pode estar temporariamente desatualizado. Mesma linguagem visual do
   FxRateNote em modo stale (pílula ocre), que já cumpre esse papel pro câmbio. */
export default function DegradedTotalNote({ degraded, assets, style }: {
  degraded?: boolean
  assets?: string[]
  style?: React.CSSProperties
}) {
  const { t } = useI18n()
  if (!degraded) return null
  const c = (t as unknown as Record<string, Record<string, string>>).common
  const label = c?.degradedTotal ?? 'Valor pode estar desatualizado'
  const detail = (c?.degradedTotalDetail ?? 'Uma fonte de preços falhou temporariamente. Afetados: {assets}. Atualiza sozinho em alguns minutos.')
    .replace('{assets}', (assets ?? []).join(', ') || '—')
  return (
    <span
      title={detail}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontFamily: 'var(--arvo-font-body)', fontSize: 10.5, fontWeight: 600,
        color: 'var(--arvo-gold-text)', background: 'var(--arvo-ocre-tint)',
        padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap',
        cursor: 'help', ...style,
      }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} style={{ flexShrink: 0 }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4M12 16.5v.5M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      </svg>
      {label}
    </span>
  )
}
