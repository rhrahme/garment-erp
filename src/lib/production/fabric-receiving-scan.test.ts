import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fabricReceiveRescanHint,
  fabricReceivingStationError,
} from "./fabric-receiving-scan.ts";
import type { FabricReceipt } from "../types/fabric-receipts.ts";

function receipt(partial: Partial<FabricReceipt>): FabricReceipt {
  return {
    id: "fr-1",
    status: "received",
    client_id: "c1",
    so_number: "SO-2026-0116",
    updated_at: "2026-07-16T16:00:00.000Z",
    weight_gsm: 240,
    client_code: "FR-0626-0037",
    client_name: "Test",
    composition: null,
    received_at: "2026-07-16T16:00:00.000Z",
    supplier_id: "loro-piana",
    garment_type: "Short",
    fabric_meters: 1.2,
    fabric_number: "S10005",
    handed_off_at: null,
    supplier_name: "Solbiati",
    sales_order_id: "so-1",
    fabric_prep_step: null,
    fabric_prep_type: null,
    sales_order_line_id: "line-1",
    ...partial,
  };
}

test("fabricReceiveRescanHint steers wash/soak/iron when Receive is scanned again", () => {
  assert.equal(
    fabricReceiveRescanHint(
      receipt({ status: "fabric_prep", fabric_prep_type: "wash_iron", fabric_prep_step: "wash" })
    ),
    "Already in wash — select Wash and scan again to finish → iron"
  );
  assert.equal(
    fabricReceiveRescanHint(
      receipt({ status: "fabric_prep", fabric_prep_type: "soak_iron", fabric_prep_step: "soak" })
    ),
    "Already soaking — select Soak and scan again to finish → iron"
  );
  assert.equal(
    fabricReceiveRescanHint(
      receipt({ status: "fabric_prep", fabric_prep_type: "wash_iron", fabric_prep_step: "iron" })
    ),
    "Wash/soak done — select Iron and scan to finish prep → cutting"
  );
  assert.equal(fabricReceiveRescanHint(receipt({ status: "received" })), null);
});

test("fabricReceivingStationError blocks wrong station after wash is finished", () => {
  const ironing = receipt({
    status: "fabric_prep",
    fabric_prep_type: "wash_iron",
    fabric_prep_step: "iron",
  });
  assert.equal(fabricReceivingStationError(ironing, "wash"), "Washing is done — scan at Iron.");
  assert.equal(fabricReceivingStationError(ironing, "iron"), null);
});
