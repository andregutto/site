import { getCDIRates, getIPCARates, getSelicRates } from './bcbService.js'

export interface FixedIncomeAsset {
  fi_principal:  number
  fi_start_date: string
  fi_type:       'pos_cdi' | 'pre' | 'ipca_plus' | 'selic'
  fi_rate:       number | null
  fi_spread?:    number | null
}

export interface FITranche {
  principal:  number
  start_date: string
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

async function calcPosCDI(tranches: FITranche[], fi_rate: number, today: Date): Promise<number> {
  const minStart = tranches.reduce((min, t) => {
    const d = new Date(t.start_date)
    return d < min ? d : min
  }, new Date(tranches[0].start_date))

  const allRates = await getCDIRates(minStart, today)
  if (allRates.length === 0) throw new Error('Nenhuma taxa CDI disponível para o período')

  let total = 0
  for (const t of tranches) {
    const tStart = new Date(t.start_date)
    tStart.setHours(0, 0, 0, 0)
    const trancheRates = allRates.filter(r => {
      const rDate = new Date(r.date)
      rDate.setHours(0, 0, 0, 0)
      return rDate >= tStart
    })
    const factor = trancheRates.reduce((acc, r) => acc * (1 + (r.value / 100) * fi_rate), 1)
    total += t.principal * factor
  }
  return total
}

async function calcSelic(tranches: FITranche[], fi_rate: number, today: Date): Promise<number> {
  const minStart = tranches.reduce((min, t) => {
    const d = new Date(t.start_date)
    return d < min ? d : min
  }, new Date(tranches[0].start_date))

  const allRates = await getSelicRates(minStart, today)
  if (allRates.length === 0) throw new Error('Nenhuma taxa Selic disponível para o período')

  let total = 0
  for (const t of tranches) {
    const tStart = new Date(t.start_date)
    tStart.setHours(0, 0, 0, 0)
    const trancheRates = allRates.filter(r => {
      const rDate = new Date(r.date)
      rDate.setHours(0, 0, 0, 0)
      return rDate >= tStart
    })
    const factor = trancheRates.reduce((acc, r) => acc * (1 + (r.value / 100) * fi_rate), 1)
    total += t.principal * factor
  }
  return total
}

function calcPre(tranches: FITranche[], fi_rate: number, today: Date): number {
  let total = 0
  for (const t of tranches) {
    const start   = new Date(t.start_date)
    const busdays = businessDaysBetween(start, today)
    const factor  = Math.pow(1 + fi_rate, busdays / 252)
    total += t.principal * factor
  }
  return total
}

async function calcIPCAPlus(tranches: FITranche[], fi_spread: number, today: Date): Promise<number> {
  const minStart = tranches.reduce((min, t) => {
    const d = new Date(t.start_date)
    return d < min ? d : min
  }, new Date(tranches[0].start_date))

  const allRates = await getIPCARates(minStart, today)
  if (allRates.length === 0) throw new Error('Nenhuma taxa IPCA disponível para o período')

  let total = 0
  for (const t of tranches) {
    const tStart  = new Date(t.start_date)
    tStart.setHours(0, 0, 0, 0)
    const busdays = businessDaysBetween(tStart, today)

    const trancheRates = allRates.filter(r => {
      const rDate = new Date(r.date)
      rDate.setHours(0, 0, 0, 0)
      return rDate >= tStart
    })
    const ipcaFactor   = trancheRates.reduce((acc, r) => acc * (1 + r.value / 100), 1)
    const spreadFactor = Math.pow(1 + fi_spread, busdays / 252)
    total += t.principal * ipcaFactor * spreadFactor
  }
  return total
}

export interface TrancheProfitResult {
  principal:     number
  start_date:    string
  current_value: number
  profit_brl:    number
}

export async function calculateTrancheProfits(
  asset: FixedIncomeAsset,
  tranches: FITranche[]
): Promise<TrancheProfitResult[]> {
  if (!tranches.length) return []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const minStart = tranches.reduce((min, t) => {
    const d = new Date(t.start_date); return d < min ? d : min
  }, new Date(tranches[0].start_date))

  if (asset.fi_type === 'pos_cdi') {
    const allRates = await getCDIRates(minStart, today)
    return tranches.map(t => {
      const tStart = new Date(t.start_date); tStart.setHours(0, 0, 0, 0)
      const trancheRates = allRates.filter(r => { const rd = new Date(r.date); rd.setHours(0, 0, 0, 0); return rd >= tStart })
      const factor = trancheRates.reduce((acc, r) => acc * (1 + (r.value / 100) * asset.fi_rate!), 1)
      const current_value = t.principal * factor
      return { principal: t.principal, start_date: t.start_date, current_value, profit_brl: current_value - t.principal }
    })
  }

  if (asset.fi_type === 'selic') {
    const allRates = await getSelicRates(minStart, today)
    const fi_rate = asset.fi_rate ?? 1
    return tranches.map(t => {
      const tStart = new Date(t.start_date); tStart.setHours(0, 0, 0, 0)
      const trancheRates = allRates.filter(r => { const rd = new Date(r.date); rd.setHours(0, 0, 0, 0); return rd >= tStart })
      const factor = trancheRates.reduce((acc, r) => acc * (1 + (r.value / 100) * fi_rate), 1)
      const current_value = t.principal * factor
      return { principal: t.principal, start_date: t.start_date, current_value, profit_brl: current_value - t.principal }
    })
  }

  if (asset.fi_type === 'pre') {
    return tranches.map(t => {
      const start = new Date(t.start_date)
      const busdays = businessDaysBetween(start, today)
      const factor = Math.pow(1 + asset.fi_rate!, busdays / 252)
      const current_value = t.principal * factor
      return { principal: t.principal, start_date: t.start_date, current_value, profit_brl: current_value - t.principal }
    })
  }

  if (asset.fi_type === 'ipca_plus') {
    const allRates = await getIPCARates(minStart, today)
    const fi_spread = asset.fi_spread ?? 0
    return tranches.map(t => {
      const tStart = new Date(t.start_date); tStart.setHours(0, 0, 0, 0)
      const busdays = businessDaysBetween(tStart, today)
      const trancheRates = allRates.filter(r => { const rd = new Date(r.date); rd.setHours(0, 0, 0, 0); return rd >= tStart })
      const ipcaFactor   = trancheRates.reduce((acc, r) => acc * (1 + r.value / 100), 1)
      const spreadFactor = Math.pow(1 + fi_spread, busdays / 252)
      const current_value = t.principal * ipcaFactor * spreadFactor
      return { principal: t.principal, start_date: t.start_date, current_value, profit_brl: current_value - t.principal }
    })
  }

  throw new Error(`Tipo de RF desconhecido: ${asset.fi_type}`)
}

export async function calculateCurrentValue(
  asset: FixedIncomeAsset,
  tranches?: FITranche[],
  refDate?: Date,
): Promise<number> {
  const effectiveTranches: FITranche[] = tranches?.length
    ? tranches
    : (() => {
        if (!asset.fi_principal || !asset.fi_start_date) {
          throw new Error('fi_principal e fi_start_date são obrigatórios')
        }
        return [{ principal: asset.fi_principal, start_date: asset.fi_start_date }]
      })()

  const refDay = new Date(refDate ?? new Date())
  refDay.setHours(0, 0, 0, 0)

  switch (asset.fi_type) {
    case 'pos_cdi':   return calcPosCDI(effectiveTranches, asset.fi_rate!, refDay)
    case 'selic':     return calcSelic(effectiveTranches, asset.fi_rate ?? 1, refDay)
    case 'pre':       return calcPre(effectiveTranches, asset.fi_rate!, refDay)
    case 'ipca_plus': return calcIPCAPlus(effectiveTranches, asset.fi_spread ?? 0, refDay)
    default:          throw new Error(`Tipo de RF desconhecido: ${asset.fi_type}`)
  }
}
