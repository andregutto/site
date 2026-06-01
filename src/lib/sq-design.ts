export const C = {
  paper:  '#FDFAF5',
  ink:    '#1C1917',
  warm:   '#F4F0E6',
  muted:  '#6B6760',
  accent: '#C05A2A', // Terracota — pedra parisienne, artisan
} as const

export const sans = 'Arial, "Helvetica Neue", Helvetica, sans-serif'

// Cores semânticas por status CRM
// Paleta: tons suaves sobre o fundo paper, legíveis e distintos
export const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  prospect:     { bg: '#FEF9EC', fg: '#7A5200' }, // âmbar — interesse, primeira impressão
  en_approche:  { bg: '#EEF3FF', fg: '#2A42A8' }, // azul — em movimento, contato iniciado
  rdv:          { bg: '#E6F3FF', fg: '#155490' }, // azul mais forte — reunião confirmada
  devis_envoye: { bg: '#F3EDFF', fg: '#522AA0' }, // violeta — proposta enviada, peso
  negocia:      { bg: '#FFF2E5', fg: '#8C3C10' }, // laranja-terracota — calor da negociação
  gagne:        { bg: '#EAFAF2', fg: '#186040' }, // verde — vitória
  actif:        { bg: '#186040', fg: '#FDFAF5' }, // verde preenchido — contrato ativo
  perdu:        { bg: '#FEF0F0', fg: '#8C1A1A' }, // vermelho suave — perdido
}

// Label tipográfico padrão para UI pequeno
export const labelStyle = {
  fontFamily: sans,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  fontSize: 11,
  fontWeight: 600,
}

// Header de seção (título de bloco)
export const sectionLabelStyle = {
  fontFamily: sans,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  fontSize: 11,
  fontWeight: 700,
  color: C.ink,
}

// Cabeçalho de tabela
export const thStyle = {
  fontFamily: sans,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  fontSize: 10,
  fontWeight: 600,
  color: C.ink,
  padding: '11px 14px',
  textAlign: 'left' as const,
  borderBottom: `0.5px solid ${C.ink}`,
  whiteSpace: 'nowrap' as const,
}

// Botão CTA primário (accent)
export const btnPrimary = {
  fontFamily: sans,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  fontSize: 11,
  fontWeight: 700,
  background: C.accent,
  color: C.paper,
  border: 'none',
  padding: '10px 20px',
  cursor: 'pointer',
  borderRadius: 0,
  display: 'inline-flex' as const,
  alignItems: 'center' as const,
  gap: 10,
}

// Botão secundário (outlined ink)
export const btnSecondary = {
  fontFamily: sans,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  fontSize: 11,
  fontWeight: 600,
  background: 'transparent',
  color: C.ink,
  border: `1px solid ${C.ink}`,
  padding: '8px 16px',
  cursor: 'pointer',
  borderRadius: 0,
  display: 'inline-flex' as const,
  alignItems: 'center' as const,
  gap: 8,
}
