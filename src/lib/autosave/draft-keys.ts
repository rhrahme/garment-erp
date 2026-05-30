/** Stable localStorage keys for form drafts across the ERP. */
export const DRAFT_KEYS = {
  salesOrderNew: "sales-order:new",
  fabricReceiving: "fabric-receiving:workspace",
  supplierInvoicesFilters: "supplier-invoices:filters",
} as const;

export type DraftKey = (typeof DRAFT_KEYS)[keyof typeof DRAFT_KEYS];
