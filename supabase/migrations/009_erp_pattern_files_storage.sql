-- Pattern DXF/PDF attachments for pattern revisions.
-- Written by the ERP service role; not public.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'erp-pattern-files',
  'erp-pattern-files',
  false,
  52428800,
  array['application/pdf', 'application/dxf', 'image/vnd.dxf', 'application/octet-stream']
)
on conflict (id) do nothing;

create policy "erp_pattern_files_select_authenticated"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'erp-pattern-files');

create policy "erp_pattern_files_insert_authenticated"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'erp-pattern-files');

create policy "erp_pattern_files_update_authenticated"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'erp-pattern-files')
  with check (bucket_id = 'erp-pattern-files');
