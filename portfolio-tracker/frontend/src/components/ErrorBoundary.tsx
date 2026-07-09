import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { detectLocale } from '../contexts/I18nContext'
import pt from '../i18n/pt.json'
import en from '../i18n/en.json'
import fr from '../i18n/fr.json'

/* Strings resolvidas sem useI18n: o boundary global fica FORA do I18nProvider,
   e um crash dentro da árvore de providers derrubaria o hook junto. */
const STRINGS = { pt: pt.common, en: en.common, fr: fr.common }

interface Props {
  children: ReactNode
  /** 'global' = tela cheia (fora dos providers); 'route' = inline dentro do
      AppLayout, header/nav continuam visíveis e utilizáveis. */
  variant?: 'global' | 'route'
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const s = STRINGS[detectLocale()]
    const isGlobal = this.props.variant !== 'route'

    const card = (
      <div style={{ background: 'var(--arvo-surface)', borderRadius: 16, border: '1px solid var(--arvo-border)', width: '100%', maxWidth: 440, padding: '40px 32px', textAlign: 'center', boxShadow: 'var(--arvo-shadow-md)' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--arvo-surface-2)', border: '1px solid var(--arvo-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <svg style={{ width: 24, height: 24, color: 'var(--arvo-gold-text)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        </div>
        <h2 style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 20, fontWeight: 700, color: 'var(--arvo-fg)', margin: '0 0 10px' }}>{s.renderErrorTitle}</h2>
        <p style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 14, color: 'var(--arvo-fg-soft)', lineHeight: 1.6, margin: '0 0 24px' }}>
          {s.renderErrorBody}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className="arvo-btn arvo-btn--primary" style={{ width: '100%' }} onClick={() => window.location.reload()}>
            {s.renderErrorReload}
          </button>
          {isGlobal && (
            <button className="arvo-btn arvo-btn--ghost" style={{ width: '100%' }} onClick={() => { window.location.href = '/' }}>
              {s.renderErrorHome}
            </button>
          )}
        </div>
        <details style={{ marginTop: 24, textAlign: 'left' }}>
          <summary style={{ fontFamily: 'var(--arvo-font-body)', fontSize: 12, color: 'var(--arvo-fg-soft)', cursor: 'pointer' }}>{s.renderErrorDetails}</summary>
          <pre style={{ marginTop: 8, padding: 12, background: 'var(--arvo-surface-2)', borderRadius: 8, fontSize: 11, color: 'var(--arvo-fg-soft)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 180, overflowY: 'auto' }}>
            {error.message}{error.stack ? `\n\n${error.stack}` : ''}
          </pre>
        </details>
      </div>
    )

    return isGlobal ? (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--arvo-bg, var(--arvo-offwhite))', padding: '24px 16px' }}>
        {card}
      </div>
    ) : (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
        {card}
      </div>
    )
  }
}

/* Boundary por rota: o `key` no pathname descarta o estado de erro ao navegar,
   então o header/nav (fora do boundary) continuam funcionando como saída. */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation()
  return <ErrorBoundary variant="route" key={location.pathname}>{children}</ErrorBoundary>
}
