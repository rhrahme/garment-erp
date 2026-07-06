import { describe, expect, it } from "vitest";
import { getFabricPosForSalesOrder } from "@/lib/sales-orders/line-cross-reference";
import type { PurchaseOrder } from "@/lib/types/fabric-sourcing";
import type { SalesOrder } from "@/lib/types/sales-orders";

function po(
  overrides: Partial<PurchaseOrder> & Pick<PurchaseOrder, "id">
): PurchaseOrder {
  return {
    po_number: "PO-2026-0001",
    supplier_id: "loro-piana",
    status: "draft",
    order_date: "2026-07-02",
    expected_date: null,
    total_amount: 100,
    client_reference: "FR-0626-0037-SO-2026-0116",
    emailed_at: null,
    email_to: null,
    expected_carrier: "DHL",
    sales_order_id: "so-1783008349661",
    lines: [{ id: "l1", fabric_number: "S10005", quantity_ordered: 1.2, unit_price: 0, client_reference: null }],
    ...overrides,
  };
}

const salesOrder = {
  id: "so-1783008349661",
  so_number: "SO-2026-0116",
  fabric_po_ids: ["po-1783030651405-g1ekcn"],
} as Pick<SalesOrder, "id" | "so_number" | "fabric_po_ids">;

describe("getFabricPosForSalesOrder", () => {
  it("finds POs linked only via fabric_po_ids when sales_order_id is stale", () => {
    const stalePo = po({
      id: "po-1783030651405-g1ekcn",
      sales_order_id: "so-deleted-old-id",
    });
    const matches = getFabricPosForSalesOrder(salesOrder, [stalePo]);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.id).toBe("po-1783030651405-g1ekcn");
  });

  it("finds POs by client_reference so_number when ids are missing", () => {
    const byRef = po({
      id: "po-orphan",
      sales_order_id: null,
      client_reference: "FR-0626-0037-SO-2026-0116",
    });
    const matches = getFabricPosForSalesOrder(salesOrder, [byRef]);
    expect(matches).toHaveLength(1);
  });

  it("excludes unrelated POs", () => {
    const other = po({
      id: "po-other",
      sales_order_id: "so-other",
      client_reference: "FR-0226-0024-SO-2026-0109",
    });
    expect(getFabricPosForSalesOrder(salesOrder, [other])).toHaveLength(0);
  });
});
