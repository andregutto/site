import { getCDIRates, getIPCARates, getSelicRates } from './bcbService'

export interface FixedIncomeAsset {
  fi_principal:  number
  fi_start_date: string
  fi_type:       'pos_cdi' | 'pre' | 'ipca_plus' | 'selic'
  fi_rate:       number | null
  fi_spread?:    number | null
}

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

async function calcPosCDI(asset: FixedIncomeAsset, today: Date): Promise<number> {
  const start = new Date(asset.fi_start_date)
  const rates  = await getCDIRates(start, today)
  if (rates.length === 0) throw new Error('Nenhuma taxa CDI disponível para o período')

  const factor = rates.reduce((acc, r) => acc * (1 + (r.value / 100) * asset.fi_rate!), 1)
  return asset.fi_principal * factor
}

async function calcSelic(asset: FixedIncomeAsset, today: Date): Promise<number> {
  const start = new Date(asset.fi_start_date)
  const rates  = await getSelicRates(start, today)
  if (rates.length === 0) throw new Error('Nenhuma taxa Selic disponível para o período')

  const factor = rates.reduce((acc, r) => acc * (1 + (r.value / 100) * (asset.fi_rate ?? 1)), 1)
  return asset.fi_principal * factor
}

function calcPre(asset: FixedIncomeAsset, today: Date): number {
  const start   = new Date(asset.fi_start_date)
  const busdays = businessDaysBetween(start, today)
  const factor  = Math.pow(1 + asset.fi_rate!, busdays / 252)
  return asset.fi_principal * factor
}

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
