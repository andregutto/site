-- ══════════════════════════════════════════════════════════════════════════════
-- Studio Quartier — Schema inicial
-- Rodar no SQL Editor do novo projeto Supabase
-- ══════════════════════════════════════════════════════════════════════════════

-- ── sq_places ─────────────────────────────────────────────────────────────────
-- Cache de análises IA (30 dias). Upsert por place_id.

create table if not exists sq_places (
  place_id         text        primary key,
  name             text        not null,
  address          text,
  lat              double precision,
  lng              double precision,
  rating           real,
  review_count     integer     default 0,
  website          text,
  phone            text,
  maps_url         text,
  google_types     jsonb,

  -- Classificação Haiku
  classification   text        not null default 'PROSPECT',  -- CHAIN | LARGE | PROSPECT
  class_reason     text,

  -- Análise Sonnet (apenas PROSPECTs)
  score            integer,
  score_breakdown  jsonb,
  services         jsonb,
  summary          text,
  has_instagram    boolean     default false,
  instagram_url    text,
  website_quality  text,       -- NONE | BASIC | OUTDATED | DECENT | GOOD

  analyzed_at      timestamptz not null default now()
);

-- ── sq_runs ───────────────────────────────────────────────────────────────────
-- Histórico de buscas lançadas na ferramenta de prospecção.

create table if not exists sq_runs (
  id               uuid        primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  neighborhood     text        not null,
  category         text        not null,
  radius           integer     not null default 600,
  total_found      integer     default 0,
  total_skipped    integer     default 0,
  total_prospects  integer     default 0
);

-- ── sq_run_places ─────────────────────────────────────────────────────────────
-- Associação entre uma busca e os lugares analisados nela.

create table if not exists sq_run_places (
  run_id           uuid        not null references sq_runs(id) on delete cascade,
  place_id         text        not null references sq_places(place_id) on delete cascade,
  primary key (run_id, place_id)
);

-- ── sq_clients ────────────────────────────────────────────────────────────────
-- CRM: prospects convertidos em leads/clientes.

create table if not exists sq_clients (
  id               uuid        primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Origem
  place_id         text        unique,   -- liga ao sq_places (pode ser nulo se criado manualmente)

  -- Identidade
  name             text        not null,
  address          text,
  neighborhood     text,
  category         text,

  -- Contato do estabelecimento
  phone_business   text,
  website          text,
  instagram_url    text,
  maps_url         text,

  -- Dados Google
  google_rating    real,
  google_reviews   integer,

  -- Dados IA
  score_initial    integer,
  services_suggested jsonb,
  ai_summary       text,

  -- Pipeline comercial
  status           text        not null default 'prospect',
  -- prospect | en_approche | rdv | devis_envoye | negocia | gagne | actif | perdu

  -- Contato humano
  contact_name     text,
  contact_role     text,
  contact_email    text,
  contact_mobile   text,

  -- Datas pipeline
  first_contact_at timestamptz,
  meeting_at       timestamptz,
  proposal_at      timestamptz,
  signed_at        timestamptz,

  -- Contrato
  services_active  jsonb,
  monthly_value    numeric(10,2),
  contract_months  integer,

  -- Notas internas
  notes            text,
  priority         integer     not null default 2  -- 1=Alta 2=Normal 3=Baixa
);

-- Trigger para atualizar updated_at automaticamente
create or replace function sq_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger sq_clients_updated_at
  before update on sq_clients
  for each row execute function sq_set_updated_at();

-- ── sq_client_events ──────────────────────────────────────────────────────────
-- Timeline de atividade por cliente (notas, chamadas, reuniões, etc.)

create table if not exists sq_client_events (
  id               uuid        primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  client_id        uuid        not null references sq_clients(id) on delete cascade,
  type             text        not null,  -- note | appel | email | réunion | proposition | contrat | statut_change
  title            text,
  content          text,
  meta             jsonb
);

-- ── Índices ───────────────────────────────────────────────────────────────────

create index if not exists sq_places_analyzed_at     on sq_places(analyzed_at desc);
create index if not exists sq_places_classification  on sq_places(classification);
create index if not exists sq_runs_created_at        on sq_runs(created_at desc);
create index if not exists sq_clients_status         on sq_clients(status);
create index if not exists sq_clients_updated_at     on sq_clients(updated_at desc);
create index if not exists sq_client_events_client   on sq_client_events(client_id, created_at desc);

-- ── RLS (Row Level Security) ──────────────────────────────────────────────────
-- Desabilitado — acesso apenas via service_role key no backend Next.js.
-- Nunca expor a service_role key no frontend.

alter table sq_places        disable row level security;
alter table sq_runs          disable row level security;
alter table sq_run_places    disable row level security;
alter table sq_clients       disable row level security;
alter table sq_client_events disable row level security;
