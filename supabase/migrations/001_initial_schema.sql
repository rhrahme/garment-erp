-- Garment Factory ERP — Initial Schema
-- Run in Supabase SQL Editor or via supabase db push

-- ─── Extensions ───────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── Enums ────────────────────────────────────────────────────
create type user_role as enum (
  'admin', 'production_manager', 'inventory_clerk',
  'purchasing', 'qc_inspector', 'hr_manager', 'viewer'
);

create type material_type as enum ('fabric', 'trim', 'accessory', 'packaging', 'other');
create type unit_of_measure as enum ('meters', 'yards', 'kg', 'pieces', 'rolls', 'cones');
create type po_status as enum ('draft', 'sent', 'confirmed', 'partial', 'received', 'cancelled');
create type so_status as enum ('draft', 'confirmed', 'in_production', 'shipped', 'delivered', 'cancelled');
create type wo_status as enum ('planned', 'cutting', 'sewing', 'washing', 'finishing', 'packed', 'completed', 'on_hold');
create type shipment_direction as enum ('inbound', 'outbound');
create type shipment_status as enum ('pending', 'in_transit', 'customs', 'delivered', 'exception');
create type qc_result as enum ('pass', 'fail', 'rework');
create type washing_type as enum ('pre_wash', 'garment_wash', 'stone_wash', 'enzyme', 'bleach', 'softener');
create type washing_status as enum ('scheduled', 'in_progress', 'completed', 'rejected');

-- ─── Profiles (extends auth.users) ────────────────────────────
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null default 'viewer',
  department text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Master Data ──────────────────────────────────────────────
create table suppliers (
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

create table customers (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,
  name text not null,
  contact_person text,
  email text,
  phone text,
  country text,
  address text,
  payment_terms text,
  created_at timestamptz not null default now()
);

create table styles (
  id uuid primary key default uuid_generate_v4(),
  style_code text unique not null,
  name text not null,
  description text,
  season text,
  category text,
  target_cost numeric(12,2),
  selling_price numeric(12,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table skus (
  id uuid primary key default uuid_generate_v4(),
  style_id uuid not null references styles(id) on delete cascade,
  sku_code text unique not null,
  color text not null,
  size text not null,
  barcode text,
  created_at timestamptz not null default now(),
  unique(style_id, color, size)
);

create table materials (
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

create table boms (
  id uuid primary key default uuid_generate_v4(),
  style_id uuid not null references styles(id) on delete cascade,
  material_id uuid not null references materials(id),
  quantity_per_unit numeric(12,4) not null,
  wastage_pct numeric(5,2) default 3,
  notes text,
  unique(style_id, material_id)
);

-- ─── Inventory ────────────────────────────────────────────────
create table inventory (
  id uuid primary key default uuid_generate_v4(),
  material_id uuid not null references materials(id) unique,
  quantity_on_hand numeric(14,4) not null default 0,
  quantity_reserved numeric(14,4) not null default 0,
  location text,
  last_counted_at timestamptz,
  updated_at timestamptz not null default now()
);

create table inventory_movements (
  id uuid primary key default uuid_generate_v4(),
  material_id uuid not null references materials(id),
  movement_type text not null check (movement_type in ('receipt', 'issue', 'adjustment', 'return', 'transfer')),
  quantity numeric(14,4) not null,
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ─── Purchasing ─────────────────────────────────────────────────
create table purchase_orders (
  id uuid primary key default uuid_generate_v4(),
  po_number text unique not null,
  supplier_id uuid not null references suppliers(id),
  status po_status not null default 'draft',
  order_date date not null default current_date,
  expected_date date,
  currency text default 'USD',
  total_amount numeric(14,2) default 0,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table purchase_order_lines (
  id uuid primary key default uuid_generate_v4(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  material_id uuid not null references materials(id),
  quantity_ordered numeric(14,4) not null,
  quantity_received numeric(14,4) not null default 0,
  unit_price numeric(12,4) not null,
  line_total numeric(14,2) generated always as (quantity_ordered * unit_price) stored
);

-- ─── Shipments / AWB Tracking ───────────────────────────────────
create table shipments (
  id uuid primary key default uuid_generate_v4(),
  awb_number text not null,
  carrier text,
  direction shipment_direction not null,
  status shipment_status not null default 'pending',
  origin text,
  destination text,
  shipped_at timestamptz,
  estimated_arrival timestamptz,
  delivered_at timestamptz,
  purchase_order_id uuid references purchase_orders(id),
  sales_order_id uuid,
  tracking_url text,
  notes text,
  created_at timestamptz not null default now()
);

-- ─── Sales Orders ───────────────────────────────────────────────
create table sales_orders (
  id uuid primary key default uuid_generate_v4(),
  so_number text unique not null,
  customer_id uuid not null references customers(id),
  status so_status not null default 'draft',
  order_date date not null default current_date,
  delivery_date date,
  currency text default 'USD',
  total_amount numeric(14,2) default 0,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table shipments add constraint shipments_sales_order_fk
  foreign key (sales_order_id) references sales_orders(id);

create table sales_order_lines (
  id uuid primary key default uuid_generate_v4(),
  sales_order_id uuid not null references sales_orders(id) on delete cascade,
  sku_id uuid not null references skus(id),
  quantity_ordered int not null,
  quantity_shipped int not null default 0,
  unit_price numeric(12,4) not null,
  line_total numeric(14,2) generated always as (quantity_ordered * unit_price) stored
);

-- ─── Production ─────────────────────────────────────────────────
create table work_orders (
  id uuid primary key default uuid_generate_v4(),
  wo_number text unique not null,
  sales_order_id uuid references sales_orders(id),
  style_id uuid not null references styles(id),
  status wo_status not null default 'planned',
  quantity_planned int not null,
  quantity_completed int not null default 0,
  start_date date,
  due_date date,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table production_stages (
  id uuid primary key default uuid_generate_v4(),
  work_order_id uuid not null references work_orders(id) on delete cascade,
  stage wo_status not null,
  sequence int not null,
  quantity_in int not null default 0,
  quantity_out int not null default 0,
  quantity_rejected int not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  assigned_to uuid references profiles(id),
  unique(work_order_id, stage)
);

-- ─── Washing ────────────────────────────────────────────────────
create table washing_batches (
  id uuid primary key default uuid_generate_v4(),
  batch_number text unique not null,
  work_order_id uuid references work_orders(id),
  washing_type washing_type not null,
  status washing_status not null default 'scheduled',
  quantity int not null,
  machine_id text,
  recipe text,
  temperature_c numeric(5,1),
  duration_minutes int,
  chemical_formula text,
  started_at timestamptz,
  completed_at timestamptz,
  operator_id uuid references profiles(id),
  notes text,
  created_at timestamptz not null default now()
);

-- ─── Quality Control ────────────────────────────────────────────
create table quality_inspections (
  id uuid primary key default uuid_generate_v4(),
  work_order_id uuid references work_orders(id),
  washing_batch_id uuid references washing_batches(id),
  inspector_id uuid references profiles(id),
  inspection_date timestamptz not null default now(),
  sample_size int not null,
  result qc_result not null,
  notes text
);

create table defects (
  id uuid primary key default uuid_generate_v4(),
  inspection_id uuid not null references quality_inspections(id) on delete cascade,
  defect_type text not null,
  severity text check (severity in ('minor', 'major', 'critical')),
  quantity int not null default 1,
  location text,
  notes text
);

-- ─── HR ─────────────────────────────────────────────────────────
create table employees (
  id uuid primary key default uuid_generate_v4(),
  employee_code text unique not null,
  profile_id uuid references profiles(id),
  full_name text not null,
  department text not null,
  job_title text,
  hire_date date,
  hourly_rate numeric(10,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table attendance (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references employees(id),
  work_date date not null,
  clock_in timestamptz,
  clock_out timestamptz,
  hours_worked numeric(5,2),
  notes text,
  unique(employee_id, work_date)
);

create table piece_rates (
  id uuid primary key default uuid_generate_v4(),
  operation text not null,
  style_id uuid references styles(id),
  rate_per_piece numeric(10,4) not null,
  effective_from date not null default current_date,
  unique(operation, style_id, effective_from)
);

create table piece_work (
  id uuid primary key default uuid_generate_v4(),
  employee_id uuid not null references employees(id),
  work_order_id uuid references work_orders(id),
  operation text not null,
  quantity int not null,
  rate numeric(10,4) not null,
  total_pay numeric(12,2) generated always as (quantity * rate) stored,
  work_date date not null default current_date
);

-- ─── Costing ────────────────────────────────────────────────────
create table style_costs (
  id uuid primary key default uuid_generate_v4(),
  style_id uuid not null references styles(id) on delete cascade,
  material_cost numeric(12,4) default 0,
  labor_cost numeric(12,4) default 0,
  washing_cost numeric(12,4) default 0,
  overhead_cost numeric(12,4) default 0,
  total_cost numeric(12,4) generated always as (
    material_cost + labor_cost + washing_cost + overhead_cost
  ) stored,
  margin_pct numeric(5,2),
  calculated_at timestamptz not null default now(),
  unique(style_id)
);

-- ─── Auto profile on signup ─────────────────────────────────────
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'viewer');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─── Updated_at trigger ─────────────────────────────────────────
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at before update on profiles
  for each row execute function set_updated_at();

-- ─── Row Level Security ─────────────────────────────────────────
alter table profiles enable row level security;
alter table suppliers enable row level security;
alter table customers enable row level security;
alter table styles enable row level security;
alter table skus enable row level security;
alter table materials enable row level security;
alter table boms enable row level security;
alter table inventory enable row level security;
alter table inventory_movements enable row level security;
alter table purchase_orders enable row level security;
alter table purchase_order_lines enable row level security;
alter table shipments enable row level security;
alter table sales_orders enable row level security;
alter table sales_order_lines enable row level security;
alter table work_orders enable row level security;
alter table production_stages enable row level security;
alter table washing_batches enable row level security;
alter table quality_inspections enable row level security;
alter table defects enable row level security;
alter table employees enable row level security;
alter table attendance enable row level security;
alter table piece_rates enable row level security;
alter table piece_work enable row level security;
alter table style_costs enable row level security;

-- Helper: get current user role
create or replace function get_user_role()
returns user_role as $$
  select role from profiles where id = auth.uid()
$$ language sql security definer stable;

-- Authenticated users can read all operational data
create policy "Authenticated read" on profiles for select to authenticated using (true);
create policy "Authenticated read" on suppliers for select to authenticated using (true);
create policy "Authenticated read" on customers for select to authenticated using (true);
create policy "Authenticated read" on styles for select to authenticated using (true);
create policy "Authenticated read" on skus for select to authenticated using (true);
create policy "Authenticated read" on materials for select to authenticated using (true);
create policy "Authenticated read" on boms for select to authenticated using (true);
create policy "Authenticated read" on inventory for select to authenticated using (true);
create policy "Authenticated read" on inventory_movements for select to authenticated using (true);
create policy "Authenticated read" on purchase_orders for select to authenticated using (true);
create policy "Authenticated read" on purchase_order_lines for select to authenticated using (true);
create policy "Authenticated read" on shipments for select to authenticated using (true);
create policy "Authenticated read" on sales_orders for select to authenticated using (true);
create policy "Authenticated read" on sales_order_lines for select to authenticated using (true);
create policy "Authenticated read" on work_orders for select to authenticated using (true);
create policy "Authenticated read" on production_stages for select to authenticated using (true);
create policy "Authenticated read" on washing_batches for select to authenticated using (true);
create policy "Authenticated read" on quality_inspections for select to authenticated using (true);
create policy "Authenticated read" on defects for select to authenticated using (true);
create policy "Authenticated read" on employees for select to authenticated using (true);
create policy "Authenticated read" on attendance for select to authenticated using (true);
create policy "Authenticated read" on piece_rates for select to authenticated using (true);
create policy "Authenticated read" on piece_work for select to authenticated using (true);
create policy "Authenticated read" on style_costs for select to authenticated using (true);

-- Admin/manager write policies (simplified — expand per module in production)
create policy "Admin write" on suppliers for all to authenticated
  using (get_user_role() in ('admin', 'purchasing'))
  with check (get_user_role() in ('admin', 'purchasing'));

create policy "Admin write" on purchase_orders for all to authenticated
  using (get_user_role() in ('admin', 'purchasing'))
  with check (get_user_role() in ('admin', 'purchasing'));

create policy "Admin write" on sales_orders for all to authenticated
  using (get_user_role() in ('admin', 'production_manager'))
  with check (get_user_role() in ('admin', 'production_manager'));

create policy "Admin write" on work_orders for all to authenticated
  using (get_user_role() in ('admin', 'production_manager'))
  with check (get_user_role() in ('admin', 'production_manager'));

create policy "Inventory write" on inventory for all to authenticated
  using (get_user_role() in ('admin', 'inventory_clerk'))
  with check (get_user_role() in ('admin', 'inventory_clerk'));

create policy "QC write" on quality_inspections for all to authenticated
  using (get_user_role() in ('admin', 'qc_inspector'))
  with check (get_user_role() in ('admin', 'qc_inspector'));

create policy "HR write" on employees for all to authenticated
  using (get_user_role() in ('admin', 'hr_manager'))
  with check (get_user_role() in ('admin', 'hr_manager'));

-- ─── Seed demo data ─────────────────────────────────────────────
insert into suppliers (code, name, contact_person, country, is_fabric_supplier, lead_time_days) values
  ('SUP-001', 'Shanghai Textile Co.', 'Li Wei', 'China', true, 21),
  ('SUP-002', 'Guangzhou Trims Ltd.', 'Chen Ming', 'China', false, 14),
  ('SUP-003', 'Istanbul Fabrics', 'Mehmet Yilmaz', 'Turkey', true, 10);

insert into customers (code, name, country) values
  ('CUS-001', 'Nordic Fashion AB', 'Sweden'),
  ('CUS-002', 'Urban Threads Inc.', 'USA'),
  ('CUS-003', 'Maison Parisienne', 'France');

insert into styles (style_code, name, season, category, target_cost, selling_price) values
  ('STY-2401', 'Classic Denim Jacket', 'FW24', 'Outerwear', 28.50, 65.00),
  ('STY-2402', 'Organic Cotton Tee', 'SS24', 'Tops', 8.20, 22.00),
  ('STY-2403', 'Slim Chino Pants', 'SS24', 'Bottoms', 15.00, 38.00);

insert into materials (code, name, material_type, unit, color, composition, unit_cost, reorder_level) values
  ('MAT-F001', '12oz Indigo Denim', 'fabric', 'meters', 'Indigo', '100% Cotton', 6.50, 500),
  ('MAT-F002', '180gsm Organic Jersey', 'fabric', 'meters', 'White', '100% Organic Cotton', 4.20, 800),
  ('MAT-F003', 'Stretch Twill', 'fabric', 'meters', 'Khaki', '97% Cotton 3% Elastane', 5.80, 400),
  ('MAT-T001', 'Metal Buttons 15mm', 'trim', 'pieces', 'Antique Brass', 'Metal', 0.08, 5000),
  ('MAT-T002', 'Woven Label', 'trim', 'pieces', 'Black/White', 'Polyester', 0.05, 10000),
  ('MAT-A001', 'Poly Bag', 'packaging', 'pieces', 'Clear', 'LDPE', 0.03, 20000);

insert into inventory (material_id, quantity_on_hand, location)
  select id, case code
    when 'MAT-F001' then 320
    when 'MAT-F002' then 1200
    when 'MAT-F003' then 180
    when 'MAT-T001' then 8500
    when 'MAT-T002' then 15000
    when 'MAT-A001' then 45000
    else 0 end,
    'Warehouse A'
  from materials;

insert into purchase_orders (po_number, supplier_id, status, order_date, expected_date, total_amount)
  select 'PO-2024-001', id, 'in_transit'::po_status, current_date - 5, current_date + 16, 12500
  from suppliers where code = 'SUP-001';

insert into shipments (awb_number, carrier, direction, status, origin, destination, purchase_order_id, estimated_arrival)
  select '176-12345678', 'DHL Express', 'inbound', 'in_transit', 'Shanghai, CN', 'Factory', po.id, now() + interval '12 days'
  from purchase_orders po where po_number = 'PO-2024-001';

insert into sales_orders (so_number, customer_id, status, order_date, delivery_date, total_amount)
  select 'SO-2024-042', c.id, 'in_production', current_date - 10, current_date + 20, 32500
  from customers c where code = 'CUS-001';

insert into work_orders (wo_number, style_id, status, quantity_planned, quantity_completed, start_date, due_date)
  select 'WO-2024-018', s.id, 'sewing', 2500, 1200, current_date - 7, current_date + 14
  from styles s where style_code = 'STY-2401';

insert into washing_batches (batch_number, work_order_id, washing_type, status, quantity, machine_id, recipe)
  select 'WASH-001', wo.id, 'stone_wash', 'completed', 500, 'WM-03', 'Stone wash 60min @ 40°C'
  from work_orders wo where wo_number = 'WO-2024-018';

insert into employees (employee_code, full_name, department, job_title, hourly_rate) values
  ('EMP-001', 'Maria Santos', 'Sewing', 'Line Supervisor', 12.50),
  ('EMP-002', 'Ahmed Hassan', 'Cutting', 'Cutter', 11.00),
  ('EMP-003', 'Priya Sharma', 'QC', 'Inspector', 10.50),
  ('EMP-004', 'John Okafor', 'Washing', 'Machine Operator', 11.50);
