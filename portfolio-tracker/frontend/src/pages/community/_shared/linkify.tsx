import type React from 'react'

const URL_RE = /(https?:\/\/[^\s<>"']+)/g

// Detecta URLs no texto puro do post/resposta e as renderiza como links
// clicáveis, preservando o resto do texto (inclui quebras de linha via
// white-space: pre-wrap no elemento pai).
export function linkifyText(text: string): React.ReactNode[] {
  const parts = text.split(URL_RE)
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      const href = part.replace(/[.,;:!?)]+$/, '')
      const trailing = part.slice(href.length)
      return (
        <span key={i}>
          <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--arvo-ocre, #E8A020)', textDecoration: 'underline' }}>
            {href}
          </a>
          {trailing}
        </span>
      )
    }
    return part
  })
}
