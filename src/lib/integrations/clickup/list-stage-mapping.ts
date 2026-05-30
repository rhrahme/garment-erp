/**
 * ClickUp list IDs → ERP stage names.
 * Keep in sync when lists are renamed in ClickUp (Hagan space).
 */
export type ClickUpOrderStage =
  | "order_received"
  | "filling_product_details"
  | "needs_review"
  | "ready_for_cutting"
  | "cutting"
  | "alteration"
  | "quality_control"
  | "delivery_tracking"
  | "awaiting_invoice"
  | "invoice_sent"
  | "payment_pending"
  | "invoice_paid"
  | "invoice_cancelled";

export type ClickUpListMapping = {
  list_id: string;
  list_name: string;
  folder: string | null;
  erp_order_stage: ClickUpOrderStage | null;
  erp_production_stage: import("@/lib/types/production").ProductionStage | null;
};

/** Hagan space — list ID to ERP mapping */
export const CLICKUP_LIST_MAPPINGS: ClickUpListMapping[] = [
  {
    list_id: "901807297440",
    list_name: "ORDER RECEIVED",
    folder: "DATA ENTRY",
    erp_order_stage: "order_received",
    erp_production_stage: null,
  },
  {
    list_id: "901807298385",
    list_name: "FILLING PRODUCT DETAILS",
    folder: "DATA ENTRY",
    erp_order_stage: "filling_product_details",
    erp_production_stage: null,
  },
  {
    list_id: "901807298573",
    list_name: "NEEDS REVIEW",
    folder: "DATA ENTRY",
    erp_order_stage: "needs_review",
    erp_production_stage: null,
  },
  {
    list_id: "901815750932",
    list_name: "READY FOR CUTTING",
    folder: "MANUFACTURING",
    erp_order_stage: "ready_for_cutting",
    erp_production_stage: "received",
  },
  {
    list_id: "901815679914",
    list_name: "CUTTING",
    folder: "MANUFACTURING",
    erp_order_stage: null,
    erp_production_stage: "cutting",
  },
  {
    list_id: "901815680060",
    list_name: "ALTERATION",
    folder: "MANUFACTURING",
    erp_order_stage: null,
    erp_production_stage: "finishing",
  },
  {
    list_id: "901815680139",
    list_name: "Quality Control",
    folder: "QC and Delivery",
    erp_order_stage: null,
    erp_production_stage: "packed",
  },
  {
    list_id: "901815680166",
    list_name: "Delivery Tracking",
    folder: "QC and Delivery",
    erp_order_stage: null,
    erp_production_stage: "completed",
  },
  {
    list_id: "901807229914",
    list_name: "AWAITING INVOICE",
    folder: "ACCOUNTING",
    erp_order_stage: "awaiting_invoice",
    erp_production_stage: null,
  },
  {
    list_id: "901807299090",
    list_name: "INVOICE SENT",
    folder: "ACCOUNTING",
    erp_order_stage: "invoice_sent",
    erp_production_stage: null,
  },
  {
    list_id: "901807299101",
    list_name: "PAYMENT PENDING",
    folder: "ACCOUNTING",
    erp_order_stage: "payment_pending",
    erp_production_stage: null,
  },
  {
    list_id: "901807299121",
    list_name: "INVOICE PAID",
    folder: "ACCOUNTING",
    erp_order_stage: "invoice_paid",
    erp_production_stage: null,
  },
  {
    list_id: "901807299107",
    list_name: "INVOICE CANCELLED",
    folder: "ACCOUNTING",
    erp_order_stage: "invoice_cancelled",
    erp_production_stage: null,
  },
];

const byListId = new Map(CLICKUP_LIST_MAPPINGS.map((row) => [row.list_id, row]));

/** Legacy name used before rename — for import of historical references */
export const CLICKUP_LIST_LEGACY_ALIASES: Record<string, string> = {
  X: "901815750932",
};

export function resolveClickUpListMapping(listId: string, listName?: string): ClickUpListMapping | null {
  const direct = byListId.get(listId);
  if (direct) return direct;

  if (listName?.trim().toUpperCase() === "X") {
    return byListId.get("901815750932") ?? null;
  }

  return null;
}

export function clickUpListDisplayName(listId: string, listName?: string): string {
  const mapping = resolveClickUpListMapping(listId, listName);
  if (mapping) return mapping.list_name;
  if (listName?.trim().toUpperCase() === "X") return "READY FOR CUTTING";
  return listName ?? listId;
}
