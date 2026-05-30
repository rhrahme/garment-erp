# Garment ERP

Enterprise resource planning system built for garment manufacturing factories. Manages the full lifecycle from fabric purchasing and AWB tracking through cutting, sewing, washing, quality control, and shipment.

## Modules

| Module | Description |
|--------|-------------|
| **Dashboard** | KPIs, active production, shipments, low-stock alerts |
| **Inventory** | Fabrics, trims, raw materials — stock levels and reservations |
| **Production** | Work orders with stage tracking (cutting → sewing → washing → finishing) |
| **Sales Orders** | Customer POs linked to styles and SKUs |
| **Purchasing** | Fabric & trim POs to suppliers with lead times |
| **AWB Tracking** | Inbound fabric shipments and outbound finished-goods tracking |
| **Washing** | Pre-wash and garment wash batches with recipes and machines |
| **Quality Control** | AQL inspections and defect logging |
| **HR & Payroll** | Employees, attendance, piece-rate pay |
| **Costing** | BOM-based cost breakdown and margin per style |

## Tech Stack

- **Frontend:** Next.js 15, React 19, TypeScript, Tailwind CSS 4
- **Backend:** Supabase (PostgreSQL, Auth, Row Level Security)
- **Roles:** admin, production_manager, inventory_clerk, purchasing, qc_inspector, hr_manager, viewer

## Quick Start

### 1. Install Node.js

Install [Node.js 20+](https://nodejs.org/) if not already installed.

### 2. Install dependencies

```bash
cd ~/Projects/garment-erp
npm install
```

### 3. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Copy `.env.local.example` to `.env.local` and fill in your project URL and anon key
3. Open the **SQL Editor** in Supabase and run the migration:

```
supabase/migrations/001_initial_schema.sql
```

4. Create your first user in **Authentication → Users**, then update their role in the `profiles` table:

```sql
update profiles set role = 'admin' where id = 'your-user-uuid';
```

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Demo Mode

Without Supabase configured, the app runs in **demo mode** with sample factory data. Just open the app and click Sign In on the login page.

## Project Structure

```
src/
├── app/
│   ├── (dashboard)/     # All ERP module pages
│   ├── login/           # Authentication
│   └── layout.tsx
├── components/
│   ├── layout/          # Sidebar, Header
│   └── ui/              # Reusable UI components
├── lib/
│   ├── data/queries.ts  # Data fetching (Supabase + demo fallback)
│   ├── supabase/        # Supabase client setup
│   └── types/           # TypeScript types
supabase/
└── migrations/          # PostgreSQL schema
```

## Fabric Sourcing Workflow

This matches how the factory actually orders fabric:

```
Price List Upload → Pick Fabric by Number → Create Order (qty + client ref) → Email Supplier → AWB Tracking
```

1. **Upload price lists** — one per supplier (6 fabric suppliers), with fabric numbers and full specs
2. **Create fabric order** — select fabric number, quantity, and **client reference** (links to customer order)
3. **Email supplier** — system generates the email with fabric no., qty, client ref, and specs
4. **Track shipment** — supplier ships via DHL or other carrier; AWB linked to the PO

### Importing price lists

Go to **Purchasing → Import Price List**, or send the files in chat and they will be imported into the catalog.

Supported formats: **CSV, Excel (.xlsx), PDF** — whatever format your suppliers use.

Expected data per fabric row:
- Fabric number (required)
- Unit price (required)
- Composition, GSM, width, color, finish, min order qty (optional but recommended)

Run migration `002_fabric_supplier_workflow.sql` after the initial schema.

## Production Workflow

```
Sales Order → Work Order → Cutting → Sewing → Washing → Finishing → QC → Pack → Ship
                    ↑
              Fabric PO → AWB Inbound → Inventory Receipt
```

## Roadmap (v2)

- [ ] Create/edit forms for all entities
- [ ] Barcode scanning for inventory
- [ ] Production line tablet view for floor workers
- [ ] PDF export (POs, invoices, packing lists)
- [ ] Multi-factory / multi-warehouse support
- [ ] Email alerts for low stock and delayed shipments
- [ ] Integration with carrier APIs for live AWB tracking

## License

Private — for internal factory use.
