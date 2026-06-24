-- Storage bucket for profile photos. Avatars were previously stored as base64
-- data URIs directly in auth.users.user_metadata.avatar_url — Supabase embeds
-- user_metadata in the JWT, so a ~25KB base64 photo bloated the access token
-- enough to blow past header-size limits, breaking EVERY authenticated request
-- with an HTTP 494 (request header too large). Avatars now live in storage and
-- user_metadata only holds a short public URL.

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars_insert" on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (auth.uid())::text);

create policy "avatars_update" on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (auth.uid())::text);

create policy "avatars_delete" on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (auth.uid())::text);

create policy "avatars_select" on storage.objects for select
  using (bucket_id = 'avatars');
