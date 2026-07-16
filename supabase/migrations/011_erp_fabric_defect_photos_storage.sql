-- Fabric defect report photos (receiving / cutting QC).
-- Written by the ERP service role; not public.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'erp-fabric-defect-photos',
  'erp-fabric-defect-photos',
  false,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

create policy "erp_fabric_defect_photos_select_authenticated"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'erp-fabric-defect-photos');

create policy "erp_fabric_defect_photos_insert_authenticated"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'erp-fabric-defect-photos');

create policy "erp_fabric_defect_photos_update_authenticated"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'erp-fabric-defect-photos')
  with check (bucket_id = 'erp-fabric-defect-photos');
