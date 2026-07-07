import type { ReactNode } from 'react'

interface FormSectionProps {
  title: string
  first?: boolean
  dotColor?: string
  children: ReactNode
}

// Agrupa campos de um formulário sob um eyebrow com ponto de cor + divisor
// fino acima — usado em painéis com muitos campos (Recursos, Momentos) pra
// separar visualmente blocos como "Capa", "Informações", "Conteúdo" em vez
// de deixar tudo solto e embolado num só space-y.
export function FormSection({ title, first, dotColor = 'var(--arvo-gold)', children }: FormSectionProps) {
  return (
    <div
      className="space-y-4"
      style={first ? { paddingTop: 4 } : { borderTop: '1px solid var(--arvo-border-soft)', paddingTop: 20, marginTop: 20 }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
        <span style={{
          fontFamily: 'var(--arvo-font-body)', fontSize: 10.5, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: 'var(--arvo-fg-soft)',
        }}>
          {title}
        </span>
      </span>
      {children}
    </div>
  )
}
