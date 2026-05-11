// Calculadora de Renda Fixa com dados reais do BCB
import { getCDIRates, getIPCARates, getSelicRates } from './bcbService.js'

export interface FixedIncomeAsset {
  fi_principal:  number
  fi_start_date: string          // ISO 8601 'YYYY-MM-DD'
  fi_type:       'pos_cdi' | 'pre' | 'ipca_plus' | 'selic'
  fi_rate:       number | null   // CDI/pré: obrigatório; ipca_plus: não usado (pode ser null)
  fi_spread?:    number | null   // IPCA+: taxa adicional a.a. decimal
}

// Conta dias úteis (seg-sex) entre duas datas — aproximação sem feriados
function businessDaysBetween(start: Date, end: Date): number {
  let count = 0
  const d = new Date(start)
  d.setHours(0, 0, 0, 0)
  const e = new Date(end)
  e.setHours(0, 0, 0, 0)
  while (d < e) {
    const day = d.getDay()
    if (day !== 0 && day !== 6) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

// pós-fixado CDI: principal × Π(1 + CDI_dia/100 × fi_rate)
async function calcPosCDI(asset: FixedIncomeAsset, today: Date): Promise<number> {
  const start = new Date(asset.fi_start_date)
  const rates  = await getCDIRates(start, today)
  if (rates.length === 0) throw new Error('Nenhuma taxa CDI disponível para o período')

  const factor = rates.reduce((acc, r) => acc * (1 + (r.value / 100) * asset.fi_rate!), 1)
  return asset.fi_principal * factor
}

// Selic: idêntico ao pós-CDI mas usando série Selic
async function calcSelic(asset: FixedIncomeAsset, today: Date): Promise<number> {
  const start = new Date(asset.fi_start_date)
  const rates  = await getSelicRates(start, today)
  if (rates.length === 0) throw new Error('Nenhuma taxa Selic disponível para o período')

  // fi_rate = 1 significa 100% Selic; geralmente não tem multiplicador
  const factor = rates.reduce((acc, r) => acc * (1 + (r.value / 100) * (asset.fi_rate ?? 1)), 1)
  return asset.fi_principal * factor
}

// Pré-fixado: principal × (1 + taxa_aa)^(dias_úteis/252)
function calcPre(asset: FixedIncomeAsset, today: Date): number {
  const start   = new Date(asset.fi_start_date)
  const busdays = businessDaysBetween(start, today)
  const factor  = Math.pow(1 + asset.fi_rate!, busdays / 252)
  return asset.fi_principal * factor
}

// IPCA+: principal × IPCA_acumulado × (1 + spread_aa)^(dias_úteis/252)
async function calcIPCAPlus(asset: FixedIncomeAsset, today: Date): Promise<number> {
  const start   = new Date(asset.fi_start_date)
  const busdays = businessDaysBetween(start, today)

  const rates  = await getIPCARates(start, today)
  if (rates.length === 0) throw new Error('Nenhuma taxa IPCA disponível para o período')

  const ipcaFactor   = rates.reduce((acc, r) => acc * (1 + r.value / 100), 1)
  const spread       = asset.fi_spread ?? 0
  const spreadFactor = Math.pow(1 + spread, busdays / 252)

  return asset.fi_principal * ipcaFactor * spreadFactor
}

export async function calculateCurrentValue(asset: FixedIncomeAsset): Promise<number> {
  if (!asset.fi_principal || !asset.fi_start_date) {
    throw new Error('fi_principal e fi_start_date são obrigatórios')
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  switch (asset.fi_type) {
    case 'pos_cdi':   return calcPosCDI(asset, today)
    case 'selic':     return calcSelic(asset, today)
    case 'pre':       return calcPre(asset, today)
    case 'ipca_plus': return calcIPCAPlus(asset, today)
    default:          throw new Error(`Tipo de RF desconhecido: ${asset.fi_type}`)
  }
}
