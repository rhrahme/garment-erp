-- Minimal warehouse inventory tables for Canclini linen stock + received fabric.
-- Safe to run on projects that already have erp_documents (006) but not the full 001 schema.

create extension if not exists "uuid-ossp";

do $$ begin
  create type material_type as enum ('fabric', 'trim', 'accessory', 'packaging', 'other');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type unit_of_measure as enum ('meters', 'yards', 'kg', 'pieces', 'rolls', 'cones');
exception when duplicate_object then null;
end $$;

create table if not exists suppliers (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,
  name text not null,
  contact_person text,
  email text,
  phone text,
  country text,
  address text,
  payment_terms text,
  lead_time_days int default 14,
  is_fabric_supplier boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists materials (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,
  name text not null,
  material_type material_type not null,
  unit unit_of_measure not null,
  color text,
  composition text,
  width_cm numeric(8,2),
  gsm numeric(8,2),
  unit_cost numeric(12,4) default 0,
  reorder_level numeric(12,2) default 0,
  supplier_id uuid references suppliers(id),
  created_at timestamptz not null default now()
);

create table if not exists inventory (
  id uuid primary key default uuid_generate_v4(),
  material_id uuid not null references materials(id) unique,
  quantity_on_hand numeric(14,4) not null default 0,
  quantity_reserved numeric(14,4) not null default 0,
  location text,
  last_counted_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table suppliers enable row level security;
alter table materials enable row level security;
alter table inventory enable row level security;

drop policy if exists "warehouse_suppliers_select" on suppliers;
create policy "warehouse_suppliers_select" on suppliers for select to authenticated using (true);

drop policy if exists "warehouse_materials_select" on materials;
create policy "warehouse_materials_select" on materials for select to authenticated using (true);

drop policy if exists "warehouse_inventory_select" on inventory;
create policy "warehouse_inventory_select" on inventory for select to authenticated using (true);

drop policy if exists "warehouse_inventory_write" on inventory;
create policy "warehouse_inventory_write" on inventory for all to authenticated
  using (true)
  with check (true);

drop policy if exists "warehouse_materials_write" on materials;
create policy "warehouse_materials_write" on materials for all to authenticated
  using (true)
  with check (true);

drop policy if exists "warehouse_suppliers_write" on suppliers;
create policy "warehouse_suppliers_write" on suppliers for all to authenticated
  using (true)
  with check (true);
