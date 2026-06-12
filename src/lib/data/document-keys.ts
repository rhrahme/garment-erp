import path from "path";

const ROOT = process.cwd();

export const ERP_DOCUMENT_SPECS = {
  clients: {
    path: path.join(ROOT, "src/data/clients.json"),
    fallback: { updated_at: null, clients: [] },
  },
  sales_orders: {
    path: path.join(ROOT, "src/data/sales-orders.json"),
    fallback: { updated_at: null, orders: [] },
  },
  fabric_receipts: {
    path: path.join(ROOT, "src/data/fabric-receipts.json"),
    fallback: { updated_at: null, receipts: [] },
  },
  fabric_receipts_archive: {
    path: path.join(ROOT, "src/data/fabric-receipts-archive.json"),
    fallback: { updated_at: null, receipts: [] },
  },
  production_work_orders: {
    path: path.join(ROOT, "src/data/production-work-orders.json"),
    fallback: { updated_at: null, work_orders: [] },
  },
  production_work_orders_archive: {
    path: path.join(ROOT, "src/data/production-work-orders-archive.json"),
    fallback: { updated_at: null, work_orders: [] },
  },
  factory_floor_map: {
    path: path.join(ROOT, "src/data/factory-floor-stations.json"),
    fallback: { updated_at: null, map_image: null, map_pdf: null, notes: null, stations: [] },
  },
  factory_workstations: {
    path: path.join(ROOT, "src/data/factory-workstations.json"),
    fallback: { updated_at: null, workstations: [] },
  },
  customer_invoices: {
    path: path.join(ROOT, "src/data/customer-invoices.json"),
    fallback: { updated_at: null, invoices: [] },
  },
  supplier_contacts: {
    path: path.join(ROOT, "src/data/suppliers/contacts.json"),
    fallback: { updated_at: null, suppliers: [], factory_orders_email: "", inbox_scan_email: "" },
  },
  payroll_employees: {
    path: path.join(ROOT, "src/data/payroll-employees.json"),
    fallback: { updated_at: null, employees: [] },
  },
  costing_rates: {
    path: path.join(ROOT, "src/data/costing-rates.json"),
    fallback: { updated_at: null, rates: [] },
  },
  fabric_orders: {
    path: path.join(ROOT, "fabric-orders.local.json"),
    fallback: { orders: [] },
  },
  shipments: {
    path: path.join(ROOT, "shipments.local.json"),
    fallback: { shipments: [] },
  },
  supplier_replies: {
    path: path.join(ROOT, "supplier-replies.local.json"),
    fallback: { replies: [] },
  },
  processed_emails: {
    path: path.join(ROOT, "processed-emails.local.json"),
    fallback: { message_ids: [] },
  },
  supplier_availability_alerts: {
    path: path.join(ROOT, "supplier-availability-alerts.local.json"),
    fallback: { alerts: [] },
  },
  supplier_invoices: {
    path: path.join(ROOT, "supplier-invoices.local.json"),
    fallback: { invoices: [] },
  },
  transporter_invoices: {
    path: path.join(ROOT, "transporter-invoices.local.json"),
    fallback: { invoices: [] },
  },
  integration_events: {
    path: path.join(ROOT, "integration-events.local.json"),
    fallback: { events: [] },
  },
  exchange_rate_state: {
    path: path.join(ROOT, "exchange-rate-state.local.json"),
    fallback: { last_alert_at: null, last_rate: null },
  },
  fabric_order_drafts: {
    path: path.join(ROOT, "fabric-order-drafts.local.json"),
    // Per-user autosave for /fabric-orders/new — NOT persisted in sales_orders until submit.
    fallback: { updated_at: null, drafts: {} },
  },
  sales_order_drafts: {
    path: path.join(ROOT, "sales-order-drafts.local.json"),
    fallback: { updated_at: null, drafts: {} },
  },
} as const;

export type ErpDocumentKey = keyof typeof ERP_DOCUMENT_SPECS;

/** Loaded on demand for most pages — avoids multi-MB downloads on every navigation. */
export const CORE_ERP_DOCUMENT_KEYS = [
  "clients",
  "sales_orders",
  "fabric_receipts",
  "production_work_orders",
  "supplier_contacts",
  "costing_rates",
  "exchange_rate_state",
] as const satisfies readonly ErpDocumentKey[];

/** Heavy integration / history blobs — only when a feature needs them. */
export const LAZY_ERP_DOCUMENT_KEYS = [
  "customer_invoices",
  "payroll_employees",
  "fabric_orders",
  "shipments",
  "supplier_replies",
  "processed_emails",
  "supplier_availability_alerts",
  "supplier_invoices",
  "transporter_invoices",
  "integration_events",
  "fabric_receipts_archive",
  "production_work_orders_archive",
  "factory_floor_map",
  "factory_workstations",
  "fabric_order_drafts",
  "sales_order_drafts",
] as const satisfies readonly ErpDocumentKey[];

export const ALL_ERP_DOCUMENT_KEYS = [
  ...CORE_ERP_DOCUMENT_KEYS,
  ...LAZY_ERP_DOCUMENT_KEYS,
] as ErpDocumentKey[];

const pathToKey = new Map<string, ErpDocumentKey>(
  ALL_ERP_DOCUMENT_KEYS.map((key) => [path.normalize(ERP_DOCUMENT_SPECS[key].path), key])
);

/** Stable Supabase document id for each local JSON file path. */
export function documentKeyForPath(filePath: string): ErpDocumentKey | null {
  return pathToKey.get(path.normalize(filePath)) ?? null;
}

export function pathForDocumentKey(key: ErpDocumentKey): string {
  return ERP_DOCUMENT_SPECS[key].path;
}
