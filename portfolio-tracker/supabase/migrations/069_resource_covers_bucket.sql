-- Bucket público pra imagem de capa dos Recursos — mesmo mecanismo de upload
-- direto do trip-covers/avatars (migration 052), diferente do bucket
-- 'resources' (privado, só o arquivo/conteúdo gated). A capa precisa ser
-- pública porque aparece no preview ANTES do gate de cadastro.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resource-covers', 'resource-covers', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "resource_covers_insert" on storage.objects for insert
  with check (bucket_id = 'resource-covers' and (storage.foldername(name))[1] = (auth.uid())::text);

create policy "resource_covers_update" on storage.objects for update
  using (bucket_id = 'resource-covers' and (storage.foldername(name))[1] = (auth.uid())::text);

create policy "resource_covers_delete" on storage.objects for delete
  using (bucket_id = 'resource-covers' and (storage.foldername(name))[1] = (auth.uid())::text);

create policy "resource_covers_select" on storage.objects for select
  using (bucket_id = 'resource-covers');
