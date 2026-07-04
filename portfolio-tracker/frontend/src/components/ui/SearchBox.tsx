import { useI18n } from '../../contexts/I18nContext'

interface SearchBoxProps {
  value: string
  onChange: (value: string) => void
  onBlurEmpty?: () => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
}

// Campo de busca expansível padrão do app (usado em Viagens, Momentos e
// Comunidade): ícone de lupa à esquerda, "x" pra limpar à direita quando há
// texto digitado.
export function SearchBox({ value, onChange, onBlurEmpty, placeholder, className, autoFocus = true }: SearchBoxProps) {
  const { t } = useI18n()
  return (
    <div className={`relative ${className ?? 'flex-1'}`}>
      <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--arvo-fg-faint)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5A6.5 6.5 0 114 10.5a6.5 6.5 0 0113 0z" />
      </svg>
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={() => { if (!value) onBlurEmpty?.() }}
        placeholder={placeholder ?? (t as any).common?.search ?? 'Buscar...'}
        style={{ fontSize: 16 }}
        className="pl-8 pr-8 py-1.5 sm:text-xs rounded-full border border-[var(--arvo-border)] bg-[var(--arvo-surface)] text-[var(--arvo-fg)] w-full focus:outline-none focus:border-[var(--arvo-gold)] transition-colors"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear"
          className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-full text-[var(--arvo-fg-faint)] hover:text-[var(--arvo-fg)] transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" d="M2 2l12 12M14 2L2 14" />
          </svg>
        </button>
      )}
    </div>
  )
}
