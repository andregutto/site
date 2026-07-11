import { useEffect } from 'react'

// Splash de boot — glifo dourado SÓLIDO, exatamente a mesma arte do splash
// nativo do iOS (as PNGs em /brand/splash foram geradas de
// /brand/logo/arvo-symbol-gold.svg). Antes o boot mostrava o ArvoLoader
// PULSANDO (as 6 partes piscando em sequência) e, logo depois, um segundo
// loader já com header+navbar — três glifos diferentes em ~1s, o "piscar de
// três formas" que dava tonteira.
//
// Aqui o glifo é o mesmo, sólido e imóvel, sobre #0D0D0D, cobrindo a tela
// inteira (zIndex alto): a transição do splash do sistema até o conteúdo vira
// uma coisa só, sem o chrome aparecer vazio no meio.
export default function ArvoSplash() {
  useEffect(() => {
    // O body é claro por padrão (tema light); força dark enquanto o splash
    // cobre a tela pra não vazar branco na safe-area do iOS.
    const prev = document.body.style.background
    document.body.style.background = '#0D0D0D'
    return () => { document.body.style.background = prev }
  }, [])
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0D0D0D', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <img src="/brand/logo/arvo-symbol-gold.svg" width={54} alt="" style={{ display: 'block' }} />
    </div>
  )
}
