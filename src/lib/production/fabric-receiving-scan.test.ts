import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fabricReceiveRescanHint,
  fabricReceivingStationError,
  planFabricStationScan,
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

test("fabricReceiveRescanHint steers wash/soak/drying/iron when Receive is scanned again", () => {
  assert.equal(
    fabricReceiveRescanHint(
      receipt({ status: "fabric_prep", fabric_prep_type: "wash_iron", fabric_prep_step: "wash" })
    ),
    "Already in wash — select Wash and scan again to hang to dry"
  );
  assert.equal(
    fabricReceiveRescanHint(
      receipt({ status: "fabric_prep", fabric_prep_type: "soak_iron", fabric_prep_step: "soak" })
    ),
    "Already soaking — select Soak and scan again to hang to dry"
  );
  assert.equal(
    fabricReceiveRescanHint(
      receipt({ status: "fabric_prep", fabric_prep_type: "wash_iron", fabric_prep_step: "drying" })
    ),
    "Hung to dry — select Iron and scan to start ironing"
  );
  assert.equal(
    fabricReceiveRescanHint(
      receipt({ status: "fabric_prep", fabric_prep_type: "wash_iron", fabric_prep_step: "iron" })
    ),
    "Ironing — select Iron and scan to finish prep → cutting"
  );
  assert.equal(fabricReceiveRescanHint(receipt({ status: "received" })), null);
});

test("fabricReceivingStationError routes wash/soak → dry → iron correctly", () => {
  const drying = receipt({
    status: "fabric_prep",
    fabric_prep_type: "wash_iron",
    fabric_prep_step: "drying",
  });
  // While drying, the fabric belongs at Iron (to start ironing), not Wash.
  assert.equal(
    fabricReceivingStationError(drying, "wash"),
    "Washing is done — it's drying. Scan at Iron to start ironing."
  );
  assert.equal(fabricReceivingStationError(drying, "iron"), null);

  const ironing = receipt({
    status: "fabric_prep",
    fabric_prep_type: "wash_iron",
    fabric_prep_step: "iron",
  });
  assert.equal(fabricReceivingStationError(ironing, "wash"), "Washing is done — scan at Iron.");
  assert.equal(fabricReceivingStationError(ironing, "iron"), null);

  // Iron scan is rejected before the fabric has been hung to dry.
  const washing = receipt({
    status: "fabric_prep",
    fabric_prep_type: "wash_iron",
    fabric_prep_step: "wash",
  });
  assert.equal(
    fabricReceivingStationError(washing, "iron"),
    "Finish wash and hang to dry first — scan at Wash."
  );
});

test("planFabricStationScan: iron scan on received fabric starts iron-only prep", () => {
  const plan = planFabricStationScan(receipt({ status: "received" }), "iron");
  assert.deepEqual(plan, { kind: "start_prep", prep_type: "iron_only" });
});

test("planFabricStationScan: iron scan advances drying → ironing and ironing → done", () => {
  assert.deepEqual(
    planFabricStationScan(
      receipt({ status: "fabric_prep", fabric_prep_type: "wash_iron", fabric_prep_step: "drying" }),
      "iron"
    ),
    { kind: "advance", from: "drying" }
  );
  assert.deepEqual(
    planFabricStationScan(
      receipt({ status: "fabric_prep", fabric_prep_type: "wash_iron", fabric_prep_step: "iron" }),
      "iron"
    ),
    { kind: "advance", from: "iron" }
  );
});

test("planFabricStationScan: iron scan on washing fabric rejects with accurate message", () => {
  const plan = planFabricStationScan(
    receipt({ status: "fabric_prep", fabric_prep_type: "wash_iron", fabric_prep_step: "wash" }),
    "iron"
  );
  assert.deepEqual(plan, {
    kind: "reject",
    message: "Finish wash and hang to dry first — scan at Wash.",
  });

  const soaking = planFabricStationScan(
    receipt({ status: "fabric_prep", fabric_prep_type: "soak_iron", fabric_prep_step: "soak" }),
    "iron"
  );
  assert.deepEqual(soaking, {
    kind: "reject",
    message: "Finish soak and hang to dry first — scan at Soak.",
  });
});

test("planFabricStationScan: wash/soak start on received and advance to drying", () => {
  assert.deepEqual(planFabricStationScan(receipt({ status: "received" }), "wash"), {
    kind: "start_prep",
    prep_type: "wash_iron",
  });
  assert.deepEqual(planFabricStationScan(receipt({ status: "received" }), "soak"), {
    kind: "start_prep",
    prep_type: "soak_iron",
  });
  assert.deepEqual(
    planFabricStationScan(
      receipt({ status: "fabric_prep", fabric_prep_type: "wash_iron", fabric_prep_step: "wash" }),
      "wash"
    ),
    { kind: "advance", from: "wash" }
  );
  assert.deepEqual(
    planFabricStationScan(
      receipt({ status: "fabric_prep", fabric_prep_type: "soak_iron", fabric_prep_step: "soak" }),
      "soak"
    ),
    { kind: "advance", from: "soak" }
  );
});

test("planFabricStationScan: wash scan on drying fabric points to Iron, not a dead end", () => {
  const plan = planFabricStationScan(
    receipt({ status: "fabric_prep", fabric_prep_type: "wash_iron", fabric_prep_step: "drying" }),
    "wash"
  );
  assert.deepEqual(plan, {
    kind: "reject",
    message: "Washing is done — it's drying. Scan at Iron to start ironing.",
  });
});

test("planFabricStationScan: only a truly missing receipt reports not-received", () => {
  const plan = planFabricStationScan(undefined, "iron");
  assert.equal(plan.kind, "reject");
  assert.match((plan as { message: string }).message, /not received yet/);

  const handedOff = planFabricStationScan(receipt({ status: "handed_off" }), "iron");
  assert.deepEqual(handedOff, {
    kind: "reject",
    message: "Fabric prep is complete — this cut is on Production now.",
  });
});
