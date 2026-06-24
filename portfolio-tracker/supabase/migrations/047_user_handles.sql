-- @username handles, used as an alternative to e-mail when inviting/finding
-- people (mirrors Instagram/Revolut-style handles). Stored in a dedicated
-- table (not user_metadata) so we get a real unique constraint and an
-- index for prefix-search autocomplete.

create table if not exists user_handles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_handles_username_format check (username ~ '^[a-z0-9_]{3,20}$')
);

create index if not exists user_handles_username_prefix_idx on user_handles (username);

alter table user_handles enable row level security;

create policy "authenticated can read handles" on user_handles
  for select using (auth.role() = 'authenticated');

create policy "user manages own handle" on user_handles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
