// Bloco placeholder que aproxima a forma do conteúdo real (mesmo grid,
// mesma altura aproximada) — evita o "salto" de layout quando um spinner
// genérico é substituído de uma vez por todo o conteúdo carregado.
export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`animate-pulse ${className}`}
      style={{ background: 'var(--arvo-hover-bg)', borderRadius: 16, ...style }}
    />
  )
}
