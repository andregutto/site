// Migração de dados: projeto antigo → Studio Quartier
// Rodar: node supabase-sq/migrate.mjs
//
// Requer as variáveis de ambiente:
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY       (projeto antigo / Arvo)
//   SQ_SUPABASE_URL + SQ_SUPABASE_SERVICE_ROLE_KEY (novo projeto SQ)
//
// Carregar com: node --env-file=.env.local supabase-sq/migrate.mjs

import { createClient } from '@supabase/supabase-js'

const OLD_URL = process.env.SUPABASE_URL
const OLD_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const NEW_URL = process.env.SQ_SUPABASE_URL
const NEW_KEY = process.env.SQ_SUPABASE_SERVICE_ROLE_KEY

if (!OLD_URL || !OLD_KEY || !NEW_URL || !NEW_KEY) {
  console.error('Variáveis de ambiente não encontradas. Rode com:')
  console.error('  node --env-file=.env.local supabase-sq/migrate.mjs')
  process.exit(1)
}

const OLD = createClient(OLD_URL, OLD_KEY, { auth: { persistSession: false } })
const NEW = createClient(NEW_URL, NEW_KEY, { auth: { persistSession: false } })

async function fetchAll(client, table) {
  const { data, error } = await client.from(table).select('*')
  if (error) throw new Error(`Fetch ${table}: ${error.message}`)
  return data ?? []
}

async function upsertBatch(client, table, rows, conflict) {
  if (!rows.length) return
  const { error } = await client.from(table).upsert(rows, { onConflict: conflict })
  if (error) throw new Error(`Upsert ${table}: ${error.message}`)
}

async function run() {
  console.log('── Lendo dados do projeto antigo…\n')

  const [places, runs, runPlaces, clients, events] = await Promise.all([
    fetchAll(OLD, 'sq_places'),
    fetchAll(OLD, 'sq_runs'),
    fetchAll(OLD, 'sq_run_places'),
    fetchAll(OLD, 'sq_clients'),
    fetchAll(OLD, 'sq_client_events'),
  ])

  console.log(`  sq_places        ${places.length}`)
  console.log(`  sq_runs          ${runs.length}`)
  console.log(`  sq_run_places    ${runPlaces.length}`)
  console.log(`  sq_clients       ${clients.length}`)
  console.log(`  sq_client_events ${events.length}`)
  console.log()

  if (!places.length && !runs.length && !clients.length) {
    console.log('Nenhum dado para migrar.')
    return
  }

  console.log('── Gravando no novo projeto…\n')

  await upsertBatch(NEW, 'sq_places',        places,    'place_id')
  console.log(`  ✓ sq_places        ${places.length}`)

  await upsertBatch(NEW, 'sq_runs',          runs,      'id')
  console.log(`  ✓ sq_runs          ${runs.length}`)

  await upsertBatch(NEW, 'sq_run_places',    runPlaces, 'run_id,place_id')
  console.log(`  ✓ sq_run_places    ${runPlaces.length}`)

  await upsertBatch(NEW, 'sq_clients',       clients,   'id')
  console.log(`  ✓ sq_clients       ${clients.length}`)

  await upsertBatch(NEW, 'sq_client_events', events,    'id')
  console.log(`  ✓ sq_client_events ${events.length}`)

  console.log('\n── Migração concluída.')
}

run().catch(e => { console.error('ERRO:', e.message); process.exit(1) })
