-- Fabric supplier workflow: price lists, client references, email POs
-- Run after 001_initial_schema.sql

-- ─── Supplier price lists (reference prices — NOT stock on hand) ─
create table supplier_price_lists (
  id uuid primary key default uuid_generate_v4(),
  supplier_id uuid not null references suppliers(id) on delete cascade,
  name text not null,
  effective_date date not null default current_date,
  currency text not null default 'USD',
  uploaded_at timestamptz not null default now(),
  notes text
);

create table supplier_fabrics (
  id uuid primary key default uuid_generate_v4(),
  supplier_id uuid not null references suppliers(id) on delete cascade,
  price_list_id uuid references supplier_price_lists(id) on delete set null,
  fabric_number text not null,
  name text,
  composition text,
  weight_gsm numeric(8,2),
  width_cm numeric(8,2),
  width_inches numeric(6,2),
  color text,
  finish text,
  weave_type text,
  unit unit_of_measure not null default 'meters',
  unit_price numeric(12,4) not null,
  min_order_qty numeric(12,2),
  lead_time_days int,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(supplier_id, fabric_number)
);

-- ─── Extend purchase orders for email workflow ──────────────────
alter table purchase_orders
  add column if not exists client_reference text,
  add column if not exists emailed_at timestamptz,
  add column if not exists email_to text,
  add column if not exists expected_carrier text;

-- Link PO lines to supplier fabric catalog + client ref per line
alter table purchase_order_lines
  add column if not exists supplier_fabric_id uuid references supplier_fabrics(id),
  add column if not exists fabric_number text,
  add column if not exists client_reference text;

-- ─── Indexes ────────────────────────────────────────────────────
create index idx_supplier_fabrics_supplier on supplier_fabrics(supplier_id);
create index idx_supplier_fabrics_number on supplier_fabrics(fabric_number);
create index idx_purchase_orders_client_ref on purchase_orders(client_reference);

-- ─── RLS ────────────────────────────────────────────────────────
alter table supplier_price_lists enable row level security;
alter table supplier_fabrics enable row level security;

create policy "Authenticated read" on supplier_price_lists for select to authenticated using (true);
create policy "Authenticated read" on supplier_fabrics for select to authenticated using (true);

create policy "Purchasing write" on supplier_price_lists for all to authenticated
  using (get_user_role() in ('admin', 'purchasing'))
  with check (get_user_role() in ('admin', 'purchasing'));

create policy "Purchasing write" on supplier_fabrics for all to authenticated
  using (get_user_role() in ('admin', 'purchasing'))
  with check (get_user_role() in ('admin', 'purchasing'));

-- ─── 6 fabric suppliers (placeholder — update names when price lists uploaded) ─
insert into suppliers (code, name, contact_person, email, country, is_fabric_supplier, lead_time_days) values
  ('FAB-001', 'Fabric Supplier 1', null, null, null, true, 14),
  ('FAB-002', 'Fabric Supplier 2', null, null, null, true, 14),
  ('FAB-003', 'Fabric Supplier 3', null, null, null, true, 14),
  ('FAB-004', 'Fabric Supplier 4', null, null, null, true, 14),
  ('FAB-005', 'Fabric Supplier 5', null, null, null, true, 14),
  ('FAB-006', 'Fabric Supplier 6', null, null, null, true, 14)
on conflict (code) do nothing;

-- Example catalog entry (replace when price lists are imported)
insert into supplier_fabrics (supplier_id, fabric_number, name, composition, weight_gsm, width_cm, color, unit_price, unit)
select s.id, 'EXAMPLE-001', 'Example Fabric', '100% Cotton', 180, 150, 'White', 4.50, 'meters'
from suppliers s where s.code = 'FAB-001'
on conflict (supplier_id, fabric_number) do nothing;
