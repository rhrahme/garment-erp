-- Bespoke ERP document store — mirrors local JSON files as jsonb blobs.
-- Keys match src/lib/data/document-keys.ts

create table if not exists erp_documents (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists erp_documents_updated_at_idx on erp_documents (updated_at desc);

alter table erp_documents enable row level security;

-- Authenticated app users can read/write ERP data
create policy "erp_documents_select_authenticated"
  on erp_documents for select
  to authenticated
  using (true);

create policy "erp_documents_insert_authenticated"
  on erp_documents for insert
  to authenticated
  with check (true);

create policy "erp_documents_update_authenticated"
  on erp_documents for update
  to authenticated
  using (true)
  with check (true);

create policy "erp_documents_delete_authenticated"
  on erp_documents for delete
  to authenticated
  using (true);

-- Service role bypasses RLS; used by API routes via admin client when configured
