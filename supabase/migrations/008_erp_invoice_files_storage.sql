-- PDF attachments from supplier inbox scan (fabric invoices + transporter/customs docs).
-- Written by the ERP service role; not public.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'erp-invoice-files',
  'erp-invoice-files',
  false,
  52428800,
  array['application/pdf']
)
on conflict (id) do nothing;

create policy "erp_invoice_files_select_authenticated"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'erp-invoice-files');

create policy "erp_invoice_files_insert_authenticated"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'erp-invoice-files');

create policy "erp_invoice_files_update_authenticated"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'erp-invoice-files')
  with check (bucket_id = 'erp-invoice-files');
