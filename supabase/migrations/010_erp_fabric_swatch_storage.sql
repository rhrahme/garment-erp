-- Supplier fabric swatch images (Loro Piana, etc.).
-- Served by the ERP API via service role; not public.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'erp-fabric-swatch',
  'erp-fabric-swatch',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "erp_fabric_swatch_select_authenticated"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'erp-fabric-swatch');

create policy "erp_fabric_swatch_insert_authenticated"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'erp-fabric-swatch');

create policy "erp_fabric_swatch_update_authenticated"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'erp-fabric-swatch')
  with check (bucket_id = 'erp-fabric-swatch');
