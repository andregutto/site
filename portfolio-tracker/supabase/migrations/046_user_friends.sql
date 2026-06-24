-- Standalone "friends" table: a contact added by email, independent of any
-- trip/category share. Lets the Pessoas page list someone before any
-- sharing has happened, and lets sharing flows pre-fill from it.

create table if not exists user_friends (
  id bigint generated always as identity primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  friend_user_id uuid references auth.users(id) on delete set null,
  invite_email text not null,
  invite_token text,
  status text not null default 'pending' check (status in ('pending', 'active')),
  created_at timestamptz not null default now(),
  joined_at timestamptz,
  unique (owner_user_id, invite_email)
);

create index if not exists user_friends_invite_token_idx on user_friends (invite_token);
create index if not exists user_friends_invite_email_idx on user_friends (invite_email);
create index if not exists user_friends_friend_user_id_idx on user_friends (friend_user_id);

alter table user_friends enable row level security;

create policy "owner manages own friends" on user_friends
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

create policy "friend can view incoming connection" on user_friends
  for select using (friend_user_id = auth.uid());
