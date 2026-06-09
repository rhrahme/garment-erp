/**
 * Dry-run checks that fabric receiving reset logic is generic (any sales order).
 * Does not mutate JSON or Supabase — only exercises pure helpers against live data.
 *
 * Usage: node scripts/verify-fabric-receiving-reset.mjs
 */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const SALES_ORDERS_PATH = path.join(ROOT, "src/data/sales-orders.json");
const RECEIPTS_PATH = path.join(ROOT, "src/data/fabric-receipts.json");
const RESET_SOURCES = [
  "src/lib/production/fabric-receiving-reset.ts",
  "src/components/fabric-receiving/FabricReceivingTestingReset.tsx",
  "src/app/api/fabric-receiving/reset-testing/route.ts",
  "src/app/api/v1/fabric-receiving/reset-testing/route.ts",
];

const HARDCODED = /so-1780164354118|SO-2026-0102/i;
const INACTIVE = new Set(["complete", "cancelled", "delivered"]);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`ok: ${message}`);
}

/** Mirror of resolveResetLineIds — reset all fabric lines when none specified. */
function resolveResetLineIds(order, lineIds) {
  const orderLineIds = new Set(order.fabric_lines.map((line) => line.id));
  if (lineIds?.length) {
    const unknown = lineIds.filter((lineId) => !orderLineIds.has(lineId));
    if (unknown.length > 0) throw new Error("One or more fabric lines do not belong to this sales order.");
    return lineIds;
  }
  return order.fabric_lines.map((line) => line.id);
}

/** Mirror of clearFabricLinePrintTimestamps — always null all three fields. */
function clearFabricLinePrintTimestamps(lines, lineIds) {
  const idSet = new Set(lineIds);
  const cleared_line_ids = [];
  const nextLines = lines.map((line) => {
    if (!idSet.has(line.id)) return line;
    cleared_line_ids.push(line.id);
    return {
      ...line,
      a4_printed_at: null,
      prep_stickers_printed_at: null,
      prod_stickers_printed_at: null,
    };
  });
  return { lines: nextLines, cleared_line_ids };
}

const salesOrders = JSON.parse(fs.readFileSync(SALES_ORDERS_PATH, "utf8"));
const receipts = JSON.parse(fs.readFileSync(RECEIPTS_PATH, "utf8"));

const candidates = salesOrders.orders
  .filter((order) => order.fabric_lines?.length > 0 && !order.retail_brand?.trim())
  .filter((order) => !INACTIVE.has(order.status))
  .slice(0, 3);

if (candidates.length < 2) {
  fail("Need at least 2 open bespoke orders with fabric lines in sales-orders.json");
} else {
  pass(`found ${candidates.length} sample orders`);
}

for (const source of RESET_SOURCES) {
  const text = fs.readFileSync(path.join(ROOT, source), "utf8");
  if (HARDCODED.test(text)) {
    fail(`${source} contains hardcoded SO-2026-0102 / so-1780164354118`);
  } else {
    pass(`${source} has no hardcoded test order`);
  }
}

for (const order of candidates) {
  const resetLineIds = resolveResetLineIds(order);
  if (resetLineIds.length !== order.fabric_lines.length) {
    fail(`${order.so_number}: expected all ${order.fabric_lines.length} lines, got ${resetLineIds.length}`);
    continue;
  }

  const withPrint = order.fabric_lines.map((line) => ({
    ...line,
    a4_printed_at: line.a4_printed_at ?? "2026-01-01T00:00:00.000Z",
    prep_stickers_printed_at: line.prep_stickers_printed_at ?? "2026-01-01T00:00:00.000Z",
    prod_stickers_printed_at: line.prod_stickers_printed_at ?? "2026-01-01T00:00:00.000Z",
  }));

  const { lines, cleared_line_ids } = clearFabricLinePrintTimestamps(withPrint, resetLineIds);
  if (cleared_line_ids.length !== resetLineIds.length) {
    fail(`${order.so_number}: cleared ${cleared_line_ids.length}/${resetLineIds.length} print timestamps`);
    continue;
  }

  const stillSet = lines.filter(
    (line) => line.a4_printed_at || line.prep_stickers_printed_at || line.prod_stickers_printed_at
  );
  if (stillSet.length > 0) {
    fail(`${order.so_number}: ${stillSet.length} line(s) still have print timestamps after clear`);
    continue;
  }

  const receiptCount = receipts.receipts.filter((receipt) => receipt.sales_order_id === order.id).length;
  pass(
    `${order.so_number} (${order.client_name}): ${resetLineIds.length} reset lines, ${receiptCount} active receipt(s) would be removed`
  );
}

if (!process.exitCode) {
  console.log("\nAll fabric receiving reset checks passed for multiple sales orders.");
}
