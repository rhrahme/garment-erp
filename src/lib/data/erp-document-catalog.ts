import type { ErpDocumentKey } from "@/lib/data/document-keys";

export type DocumentCategoryId =
  | "clients_orders"
  | "production"
  | "purchasing"
  | "inbox"
  | "finance";

export interface ErpDocumentDefinition {
  key: ErpDocumentKey;
  label: string;
  description: string;
  category: DocumentCategoryId;
  appHref?: string;
  sourcePath: string;
}

export const ERP_DOCUMENT_CATEGORIES: Array<{ id: DocumentCategoryId; label: string; description: string }> =
  [
    {
      id: "clients_orders",
      label: "Clients & sales orders",
      description: "Client profiles, bespoke orders, and customer invoicing",
    },
    {
      id: "production",
      label: "Production & fabric receiving",
      description: "Fabric receipts, work orders, and shop-floor tracking",
    },
    {
      id: "purchasing",
      label: "Purchasing & logistics",
      description: "Fabric POs, shipments, and supplier documents",
    },
    {
      id: "inbox",
      label: "Supplier inbox & integrations",
      description: "Email scan state, replies, alerts, and automation logs",
    },
    {
      id: "finance",
      label: "Finance & HR",
      description: "Payroll, costing rates, and exchange-rate alerts",
    },
  ];

export const ERP_DOCUMENT_DEFINITIONS: ErpDocumentDefinition[] = [
  {
    key: "clients",
    label: "Clients",
    description: "Client profiles, codes, brands, and contact details",
    category: "clients_orders",
    appHref: "/clients",
    sourcePath: "src/data/clients.json",
  },
  {
    key: "sales_orders",
    label: "Sales orders",
    description: "Bespoke client orders, fabric lines, and label stickers",
    category: "clients_orders",
    appHref: "/orders",
    sourcePath: "src/data/sales-orders.json",
  },
  {
    key: "customer_invoices",
    label: "Customer invoices",
    description: "Invoices raised against sales orders",
    category: "clients_orders",
    appHref: "/invoices",
    sourcePath: "src/data/customer-invoices.json",
  },
  {
    key: "sales_workspace",
    label: "Sales workspace",
    description: "Client measurements, photos, fittings, and milestone acknowledgements",
    category: "clients_orders",
    appHref: "/sales",
    sourcePath: "src/data/sales-workspace.json",
  },
  {
    key: "fabric_receipts",
    label: "Fabric receipts",
    description: "Received fabric lines and prep/handoff status",
    category: "production",
    appHref: "/fabric-receiving",
    sourcePath: "src/data/fabric-receipts.json",
  },
  {
    key: "thread_button_matches",
    label: "Thread & button matches",
    description: "Task team thread/button match status per fabric article",
    category: "production",
    appHref: "/thread-buttons",
    sourcePath: "src/data/thread-button-matches.json",
  },
  {
    key: "pattern_jobs",
    label: "Pattern jobs",
    description: "Pattern drafting queue, fittings, and revisions per fabric line",
    category: "production",
    appHref: "/pattern",
    sourcePath: "src/data/pattern-jobs.json",
  },
  {
    key: "fabric_transfers",
    label: "Fabric transfers",
    description: "Audit trail of fabric moved between clients / sales orders",
    category: "production",
    appHref: "/fabric-receiving",
    sourcePath: "src/data/fabric-transfers.json",
  },
  {
    key: "production_work_orders",
    label: "Production work orders",
    description: "Sticker-based work orders on the production floor",
    category: "production",
    appHref: "/production",
    sourcePath: "src/data/production-work-orders.json",
  },
  {
    key: "production_scan_events",
    label: "Production scan events",
    description: "Employee + sticker scan audit trail on fabric receiving and production floor",
    category: "production",
    appHref: "/production",
    sourcePath: "src/data/production-scan-events.json",
  },
  {
    key: "factory_floor_map",
    label: "Factory floor map",
    description: "Hagan factory layout PDF for shop-floor stations",
    category: "production",
    appHref: "/production/floor-map",
    sourcePath: "reference-documents/Factory/HAGAN FACTORY LAYOUT.pdf",
  },
  {
    key: "supplier_contacts",
    label: "Supplier contacts",
    description: "Supplier directory, emails, and inbox scan settings",
    category: "purchasing",
    appHref: "/purchasing/suppliers",
    sourcePath: "src/data/suppliers/contacts.json",
  },
  {
    key: "custom_fabrics",
    label: "Custom / one-off fabrics",
    description: "CF-YYYY-#### fabrics created outside mill price lists",
    category: "purchasing",
    appHref: "/fabric-specification",
    sourcePath: "src/data/custom-fabrics.json",
  },
  {
    key: "fabric_orders",
    label: "Fabric purchase orders",
    description: "Supplier fabric POs created from sales orders",
    category: "purchasing",
    appHref: "/purchasing",
    sourcePath: "fabric-orders.local.json",
  },
  {
    key: "shipments",
    label: "AWB shipments",
    description: "Inbound/outbound tracking numbers and carrier status",
    category: "purchasing",
    appHref: "/shipments",
    sourcePath: "shipments.local.json",
  },
  {
    key: "supplier_invoices",
    label: "Supplier invoice index",
    description: "Metadata for fabric supplier PDF invoices from inbox scan",
    category: "purchasing",
    appHref: "/supplier-invoices",
    sourcePath: "supplier-invoices.local.json",
  },
  {
    key: "transporter_invoices",
    label: "Transporter / customs index",
    description: "DHL, customs, and freight documents linked by AWB",
    category: "purchasing",
    appHref: "/supplier-invoices",
    sourcePath: "transporter-invoices.local.json",
  },
  {
    key: "supplier_replies",
    label: "Supplier email replies",
    description: "Parsed supplier reply threads from inbox scan",
    category: "inbox",
    appHref: "/supplier-inbox",
    sourcePath: "supplier-replies.local.json",
  },
  {
    key: "processed_emails",
    label: "Processed emails",
    description: "IMAP message IDs already scanned (deduplication)",
    category: "inbox",
    sourcePath: "processed-emails.local.json",
  },
  {
    key: "supplier_availability_alerts",
    label: "Fabric availability alerts",
    description: "Out-of-stock or delayed fabric alerts from supplier emails",
    category: "inbox",
    appHref: "/supplier-inbox",
    sourcePath: "supplier-availability-alerts.local.json",
  },
  {
    key: "integration_events",
    label: "Integration event log",
    description: "Webhook and automation events (Zapier, API, etc.)",
    category: "inbox",
    sourcePath: "integration-events.local.json",
  },
  {
    key: "payroll_employees",
    label: "Payroll employees",
    description: "Salary register and bank details for WPS transfer",
    category: "finance",
    appHref: "/hr",
    sourcePath: "src/data/payroll-employees.json",
  },
  {
    key: "costing_rates",
    label: "Costing rates",
    description: "Factory costing assumptions and rate tables",
    category: "finance",
    appHref: "/costing",
    sourcePath: "src/data/costing-rates.json",
  },
  {
    key: "exchange_rate_state",
    label: "Exchange rate alerts",
    description: "EUR/SAR alert threshold state",
    category: "finance",
    sourcePath: "exchange-rate-state.local.json",
  },
];

export function recordSummaryForKey(key: ErpDocumentKey, data: unknown): string {
  const record = data as Record<string, unknown>;
  switch (key) {
    case "clients":
      return `${Array.isArray(record.clients) ? record.clients.length : 0} clients`;
    case "sales_orders":
      return `${Array.isArray(record.orders) ? record.orders.length : 0} orders`;
    case "fabric_receipts":
      return `${Array.isArray(record.receipts) ? record.receipts.length : 0} receipts`;
    case "thread_button_matches":
      return `${Array.isArray(record.matches) ? record.matches.length : 0} matches`;
    case "production_work_orders":
      return `${Array.isArray(record.work_orders) ? record.work_orders.length : 0} work orders`;
    case "customer_invoices":
      return `${Array.isArray(record.invoices) ? record.invoices.length : 0} invoices`;
    case "supplier_contacts":
      return `${Array.isArray(record.suppliers) ? record.suppliers.length : 0} suppliers`;
    case "payroll_employees":
      return `${Array.isArray(record.employees) ? record.employees.length : 0} employees`;
    case "costing_rates":
      return `${Array.isArray(record.rates) ? record.rates.length : 0} rate rows`;
    case "fabric_orders":
      return `${Array.isArray(record.orders) ? record.orders.length : 0} fabric POs`;
    case "shipments":
      return `${Array.isArray(record.shipments) ? record.shipments.length : 0} shipments`;
    case "supplier_replies":
      return `${Array.isArray(record.replies) ? record.replies.length : 0} replies`;
    case "processed_emails":
      return `${Array.isArray(record.message_ids) ? record.message_ids.length : 0} message IDs`;
    case "supplier_availability_alerts":
      return `${Array.isArray(record.alerts) ? record.alerts.length : 0} alerts`;
    case "supplier_invoices":
      return `${Array.isArray(record.invoices) ? record.invoices.length : 0} invoice records`;
    case "transporter_invoices":
      return `${Array.isArray(record.invoices) ? record.invoices.length : 0} documents`;
    case "integration_events":
      return `${Array.isArray(record.events) ? record.events.length : 0} events`;
    case "exchange_rate_state":
      return record.last_rate != null ? "Rate alert configured" : "No alert sent yet";
    case "factory_floor_map":
      return "Hagan factory layout PDF";
    default:
      return "—";
  }
}

export function updatedAtFromData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const value = (data as { updated_at?: unknown }).updated_at;
  return typeof value === "string" ? value : null;
}
