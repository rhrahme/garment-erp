-- Thread & buttons matching photos (Task / QC / Production / Admin).
-- Written by the ERP service role; not public.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'erp-thread-button-photos',
  'erp-thread-button-photos',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

create policy "erp_thread_button_photos_select_authenticated"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'erp-thread-button-photos');

create policy "erp_thread_button_photos_insert_authenticated"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'erp-thread-button-photos');

create policy "erp_thread_button_photos_update_authenticated"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'erp-thread-button-photos')
  with check (bucket_id = 'erp-thread-button-photos');

create policy "erp_thread_button_photos_delete_authenticated"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'erp-thread-button-photos');
