import { describe, expect, it } from "vitest";
import {
  destinationCityForFabricOrder,
  enrichShipmentsWithDestinationCity,
  resolveShipmentDestinationCity,
} from "@/lib/integrations/shipment-destination";
import type { PurchaseOrder } from "@/lib/types/fabric-sourcing";
import type { ShipmentRecord } from "@/lib/integrations/shipment-store";
import type { SalesOrder } from "@/lib/types/sales-orders";
import type { SupplierReplyRecord } from "@/lib/integrations/supplier-reply-store";

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
    sales_order_id: "so-1",
    ...overrides,
  };
}

function salesOrder(overrides: Partial<SalesOrder> = {}): SalesOrder {
  return {
    id: "so-1",
    so_number: "SO-2026-0001",
    client_id: "client-1",
    client_code: "CLI001",
    client_name: "Client",
    client_reference: "REF-1",
    order_date: "2026-01-01",
    delivery_date: null,
    delivery_destination: "RUH",
    status: "fabric_pos_created",
    notes: null,
    fabric_lines: [],
    fabric_po_ids: ["po-1"],
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

describe("shipment destination city", () => {
  it("resolves destination city from linked sales order via fabric PO", () => {
    const city = resolveShipmentDestinationCity(
      shipment(),
      [fabricOrder()],
      [salesOrder({ delivery_destination: "DXB" })]
    );
    expect(city).toBe("Dubai");
  });

  it("falls back to sales order fabric_po_ids when PO sales_order_id is missing", () => {
    const city = resolveShipmentDestinationCity(
      shipment(),
      [fabricOrder({ sales_order_id: null })],
      [salesOrder({ delivery_destination: "RUH" })]
    );
    expect(city).toBe("Riyadh");
  });

  it("falls back to supplier reply text when no sales order link exists", () => {
    const replies: SupplierReplyRecord[] = [
      {
        id: "reply-1",
        po_number: null,
        supplier_id: "caccioppoli",
        from_address: "orders@caccioppoli.it",
        subject: "AWB for Dubai shipment",
        body: "",
        received_at: "2026-01-03T00:00:00Z",
        awb_numbers: ["1234567890"],
      },
    ];
    const city = resolveShipmentDestinationCity(
      shipment({ purchase_order_id: null, po_number: null }),
      [],
      [],
      replies
    );
    expect(city).toBe("Dubai");
  });

  it("enriches pending fabric orders with destination city", () => {
    expect(destinationCityForFabricOrder(fabricOrder(), [salesOrder()])).toBe("Riyadh");
  });

  it("returns null for outbound shipments", () => {
    expect(
      resolveShipmentDestinationCity(
        shipment({ direction: "outbound" }),
        [fabricOrder()],
        [salesOrder()]
      )
    ).toBeNull();
  });

  it("batch-enriches shipments with destination_city", () => {
    const enriched = enrichShipmentsWithDestinationCity(
      [shipment()],
      [fabricOrder()],
      [salesOrder({ delivery_destination: "RUH" })]
    );
    expect(enriched[0]?.destination_city).toBe("Riyadh");
  });
});
