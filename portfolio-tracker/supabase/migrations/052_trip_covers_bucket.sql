-- Storage bucket for trip cover photos. The edit panel previously exposed a
-- raw cover_image_url text field — internal storage URLs shouldn't be
-- user-facing; the user should pick/upload a photo instead, same pattern as
-- avatars and moment photos.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-covers', 'trip-covers', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "trip_covers_insert" on storage.objects for insert
  with check (bucket_id = 'trip-covers' and (storage.foldername(name))[1] = (auth.uid())::text);

create policy "trip_covers_update" on storage.objects for update
  using (bucket_id = 'trip-covers' and (storage.foldername(name))[1] = (auth.uid())::text);

create policy "trip_covers_delete" on storage.objects for delete
  using (bucket_id = 'trip-covers' and (storage.foldername(name))[1] = (auth.uid())::text);

create policy "trip_covers_select" on storage.objects for select
  using (bucket_id = 'trip-covers');
