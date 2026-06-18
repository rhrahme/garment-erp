/** Stable localStorage keys for form drafts across the ERP. */
export const DRAFT_KEYS = {
  salesOrderNew: "sales-order:new",
  /** Fabric Orders → New uses a separate key so drafts don't collide with Sales Orders. */
  fabricOrderNew: "fabric-order:new",
  /** Queued single-client fabric order drafts (split when continuing one of several). */
  fabricOrderQueue: "fabric-order:queue",
  salesOrderDuplicate: (sourceOrderId: string) => `sales-order:duplicate:${sourceOrderId}`,
  fabricReceiving: "fabric-receiving:workspace",
  supplierInvoicesFilters: "supplier-invoices:filters",
} as const;

export type DraftKey = (typeof DRAFT_KEYS)[keyof typeof DRAFT_KEYS];
