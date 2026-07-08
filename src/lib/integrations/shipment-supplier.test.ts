import { describe, expect, it, vi } from "vitest";
import {
  enrichShipmentsWithSupplierName,
  resolveShipmentSupplierName,
  supplierNameForFabricOrder,
} from "@/lib/integrations/shipment-supplier";
import type { PurchaseOrder } from "@/lib/types/fabric-sourcing";
import type { ShipmentRecord } from "@/lib/integrations/shipment-store";
import type { SupplierReplyRecord } from "@/lib/integrations/supplier-reply-store";

vi.mock("@/lib/data/supplier-contacts", () => ({
  getSupplierByIdFromContactsSync: (id: string) =>
    id === "caccioppoli" ? { id, name: "Caccioppoli" } : undefined,
}));

function fabricOrder(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: "po-1",
    po_number: "PO-2026-0001",
    supplier_id: "caccioppoli",
    status: "sent",
    order_date: "2026-01-01",
    expected_date: null,
    total_amount: 100,
    client_reference: null,
    emailed_at: "2026-01-02T00:00:00Z",
    email_to: "orders@example.com",
    expected_carrier: "DHL",
    ...overrides,
  };
}

function shipment(overrides: Partial<ShipmentRecord> = {}): ShipmentRecord {
  return {
    id: "ship-1",
    awb_number: "1234567890",
    carrier: "DHL",
    purchase_order_id: "po-1",
    po_number: "PO-2026-0001",
    status: "in_transit",
    direction: "inbound",
    estimated_arrival: null,
    created_at: "2026-01-03T00:00:00Z",
    ...overrides,
  };
}

describe("shipment-supplier", () => {
  it("resolves supplier name from supplier_id when nested supplier is missing", () => {
    const po = fabricOrder({ supplier: undefined });
    expect(supplierNameForFabricOrder(po)).toBe("Caccioppoli");
  });

  it("prefers nested supplier name when present", () => {
    const po = fabricOrder({
      supplier: {
        id: "caccioppoli",
        code: "CAC",
        name: "Caccioppoli Napoli",
        contact_person: null,
        email: null,
        country: "Italy",
        is_fabric_supplier: true,
        lead_time_days: 14,
      },
    });
    expect(supplierNameForFabricOrder(po)).toBe("Caccioppoli Napoli");
  });

  it("resolves inbound shipment supplier via linked PO", () => {
    const name = resolveShipmentSupplierName(shipment(), [fabricOrder({ supplier: undefined })]);
    expect(name).toBe("Caccioppoli");
  });

  it("matches fabric PO by po_number when purchase_order_id is missing", () => {
    const name = resolveShipmentSupplierName(
      shipment({ purchase_order_id: null }),
      [fabricOrder({ supplier: undefined })]
    );
    expect(name).toBe("Caccioppoli");
  });

  it("falls back to supplier reply when shipment has no PO link", () => {
    const replies: SupplierReplyRecord[] = [
      {
        id: "reply-1",
        po_number: null,
        supplier_id: "caccioppoli",
        from_address: "orders@caccioppoli.it",
        subject: "AWB",
        body: "",
        received_at: "2026-01-03T00:00:00Z",
        awb_numbers: ["1234567890"],
      },
    ];
    const enriched = enrichShipmentsWithSupplierName(
      [shipment({ purchase_order_id: null, po_number: null })],
      [],
      replies
    );
    expect(enriched[0]?.supplier_name).toBe("Caccioppoli");
  });

  it("returns null for outbound shipments", () => {
    expect(
      resolveShipmentSupplierName(shipment({ direction: "outbound" }), [fabricOrder()])
    ).toBeNull();
  });
});
