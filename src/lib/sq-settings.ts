import { getSupabaseSQ } from './supabase-sq'

export interface AgencySettings {
  regime_fiscal:   string
  agency_name:     string
  agency_address:  string
  agency_email:    string
  agency_siret:    string
  agency_website:  string
}

export const SETTINGS_DEFAULTS: AgencySettings = {
  regime_fiscal:  'auto_entrepreneur',
  agency_name:    'Studio Quartier',
  agency_address: 'Paris, France',
  agency_email:   '',
  agency_siret:   '',
  agency_website: 'studioquartier.fr',
}

export async function getAgencySettings(): Promise<AgencySettings> {
  const sb = getSupabaseSQ()
  if (!sb) return SETTINGS_DEFAULTS
  const { data } = await (sb as any).from('sq_settings').select('key, value')
  const map: Record<string, string> = {}
  for (const row of (data ?? [])) map[row.key] = row.value
  return { ...SETTINGS_DEFAULTS, ...map }
}
