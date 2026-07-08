// Switch estilo iPhone — ÚNICO controle liga/desliga da plataforma (regra:
// nunca checkbox pra estado on/off). Ligado = trilho verde da plataforma;
// desligado = trilho neutro claro, visivelmente "desligado". Checkbox nativo
// fica reservado pra consentimento em formulário e seleção múltipla em lista.
interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  /** Rótulo acessível (aria-label) — obrigatório quando não há <label> visível ao lado */
  label?: string
}

// Curva quase linear e lenta (~280ms), padrão de animação do app — nada bouncy
const EASE = 'cubic-bezier(0.35, 0, 0.65, 1)'

export function Switch({ checked, onChange, disabled, label }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative', width: 44, height: 26, borderRadius: 999, flexShrink: 0,
        border: 'none', padding: 0, cursor: disabled ? 'default' : 'pointer',
        background: checked ? 'var(--arvo-green, #1F8A5B)' : 'var(--arvo-border)',
        opacity: disabled ? 0.5 : 1,
        transition: `background 280ms ${EASE}`,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute', top: 2, left: 2,
          width: 22, height: 22, borderRadius: '50%', background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.22)',
          transform: checked ? 'translateX(18px)' : 'translateX(0)',
          transition: `transform 280ms ${EASE}`,
        }}
      />
    </button>
  )
}
