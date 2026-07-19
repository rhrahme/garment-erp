insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'erp-client-photos',
  'erp-client-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

create policy "erp_client_photos_select_authenticated"
  on storage.objects for select to authenticated
  using (bucket_id = 'erp-client-photos');

create policy "erp_client_photos_insert_authenticated"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'erp-client-photos');
