import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { purchaseOrdersBatchToEmail } from "@/lib/fabric-sourcing/email-content";
import {
  fabricPoSupplierId,
  fabricPoSupplierIdForGroup,
  isLoroPianaFactorySupplier,
  supplierEmailBatchKey,
} from "@/lib/fabric-sourcing/supplier-display";
import { groupSupplierEmailBatches, type SupplierEmailQueueItem } from "@/lib/fabric-sourcing/supplier-email-batches";

function po(
  overrides: Partial<SupplierEmailQueueItem> & Pick<SupplierEmailQueueItem, "id" | "supplier_id">
): SupplierEmailQueueItem {
  return {
    po_number: `PO-${overrides.id}`,
    order_date: "2026-06-20",
    status: "draft",
    client_reference: "FR-0626-0037-SO-2026-0999",
    sales_order_id: "so-test",
    supplier: {
      id: overrides.supplier_id,
      code: overrides.supplier_id.toUpperCase(),
      name: overrides.supplier_id === "solbiati" ? "Solbiati" : "Loro Piana",
      contact_person: null,
      email: "orders@loropiana.com",
      country: "Italy",
      is_fabric_supplier: true,
      lead_time_days: 14,
    },
    lines: [{ fabric_number: "781006", quantity_ordered: 2, unit_price: 100 }],
    so_number: "SO-2026-0999",
    client_code: "FR-0626-0037",
    delivery_destination: "RUH",
    ...overrides,
  };
}

describe("Loro Piana factory email grouping", () => {
  it("routes Solbiati and Loro Piana lines to the same PO supplier", () => {
    assert.equal(fabricPoSupplierId("loro-piana", "781006"), "loro-piana");
    assert.equal(fabricPoSupplierId("loro-piana", "S13028"), "loro-piana");
    assert.equal(fabricPoSupplierId("solbiati", "S13028"), "loro-piana");
  });

  it("merges legacy mill-line group keys into the Loro Piana account", () => {
    assert.equal(fabricPoSupplierIdForGroup("loro-piana:solbiati"), "loro-piana");
    assert.equal(fabricPoSupplierIdForGroup("loro-piana:main"), "loro-piana");
  });

  it("treats Solbiati as the same factory for email batch keys", () => {
    assert.equal(isLoroPianaFactorySupplier("loro-piana"), true);
    assert.equal(isLoroPianaFactorySupplier("solbiati"), true);
    assert.equal(isLoroPianaFactorySupplier("caccioppoli"), false);
    assert.equal(supplierEmailBatchKey("solbiati"), "loro-piana");
  });

  it("combines pending Solbiati and Loro Piana POs into one email batch", () => {
    const batches = groupSupplierEmailBatches(
      [
        po({ id: "po-lp", supplier_id: "loro-piana" }),
        po({ id: "po-sol", supplier_id: "solbiati", lines: [{ fabric_number: "S13028", quantity_ordered: 3.6, unit_price: 34.5 }] }),
      ],
      { consolidate: true }
    );

    assert.equal(batches.length, 1);
    assert.equal(batches[0]!.supplier_id, "loro-piana");
    assert.equal(batches[0]!.supplier_name, "Loro Piana");
    assert.equal(batches[0]!.orders.length, 2);
    assert.equal(batches[0]!.fabric_line_count, 2);
  });

  it("models FR-0626-0037-style mixed-brand orders as one factory batch", () => {
    const batches = groupSupplierEmailBatches(
      [
        po({
          id: "po-mixed-lp",
          supplier_id: "loro-piana",
          client_code: "FR-0626-0037",
          client_reference: "FR-0626-0037-SO-2026-1200",
          lines: [
            { fabric_number: "781006", quantity_ordered: 2.1, unit_price: 106 },
            { fabric_number: "722001", quantity_ordered: 2, unit_price: 33.5 },
          ],
        }),
        po({
          id: "po-mixed-sol",
          supplier_id: "solbiati",
          client_code: "FR-0626-0037",
          client_reference: "FR-0626-0037-SO-2026-1200",
          lines: [
            { fabric_number: "S13028", quantity_ordered: 3.6, unit_price: 34.5 },
            { fabric_number: "S23014", quantity_ordered: 2.2, unit_price: 88.5 },
          ],
        }),
      ],
      { consolidate: true }
    );

    assert.equal(batches.length, 1);
    assert.equal(batches[0]!.orders.length, 2);
    assert.equal(batches[0]!.fabric_line_count, 4);
  });

  it("combines legacy split POs on one sales order when not cross-client consolidating", () => {
    const batches = groupSupplierEmailBatches(
      [
        po({ id: "po-lp", supplier_id: "loro-piana", sales_order_id: "so-fr-0626-0037" }),
        po({ id: "po-sol", supplier_id: "solbiati", sales_order_id: "so-fr-0626-0037" }),
        po({ id: "po-cac", supplier_id: "caccioppoli", sales_order_id: "so-fr-0626-0037" }),
      ],
      { consolidate: false }
    );

    assert.equal(batches.length, 2);
    const loroBatch = batches.find((batch) => batch.supplier_id === "loro-piana");
    const cacBatch = batches.find((batch) => batch.supplier_id === "caccioppoli");
    assert.equal(loroBatch?.orders.length, 2);
    assert.equal(cacBatch?.orders.length, 1);
  });

  it("uses Loro Piana greeting for legacy Solbiati-only factory POs", () => {
    const email = purchaseOrdersBatchToEmail(
      [
        po({
          id: "po-sol-only",
          supplier_id: "solbiati",
          lines: [{ fabric_number: "S13028", quantity_ordered: 3.6, unit_price: 34.5 }],
        }),
      ],
      []
    );

    assert.match(email.body, /^Dear Loro Piana,/m);
    assert.match(email.subject, /Fabric Order PO-po-sol-only/);
  });
});
