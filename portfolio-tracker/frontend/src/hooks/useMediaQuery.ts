import { useState, useEffect } from 'react'

// Hook genérico de media query — mesmo padrão de useIsMobile.ts, mas
// parametrizável. Criado pra detectar "dispositivo com mouse de verdade"
// (`(hover: hover) and (pointer: fine)`) no roteiro da viagem: hover não
// existe em touch, então esconder-e-revelar em :hover não pode ser a única
// forma de acessar uma ação em telas touch — precisa saber em runtime se o
// dispositivo suporta hover pra decidir entre esconder atrás do hover ou
// deixar sempre visível.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  )

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

// Atalho pro caso de uso específico do roteiro: dispositivo com mouse de
// verdade (hover confiável), não touch.
export function useHoverCapable(): boolean {
  return useMediaQuery('(hover: hover) and (pointer: fine)')
}
