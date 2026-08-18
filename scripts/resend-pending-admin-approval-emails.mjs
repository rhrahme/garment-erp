import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq < 1) continue;
  const key = trimmed.slice(0, eq);
  let value = trimmed.slice(eq + 1);
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = value;
}

const { ensureDocumentsLoaded } = await import("../src/lib/data/document-persistence.ts");
const { listPendingClientNameChangeRequests } = await import(
  "../src/lib/clients/name-change-requests.ts"
);
const { notifyAdminsOfClientNameChangeRequest } = await import(
  "../src/lib/integrations/client-name-change-alert.ts"
);
const {
  listPendingSewingSessionChangeRequests,
  readSewingSessionChangeRequestsFresh,
} = await import("../src/lib/data/sewing-session-change-requests.ts");
const { notifyAdminsOfSewingSessionChangeRequest } = await import(
  "../src/lib/integrations/sewing-session-change-request-alert.ts"
);
const { ensureFabricOrdersLoaded } = await import("../src/lib/integrations/fabric-order-store.ts");
const { listPendingFabricLineDeleteRequests } = await import(
  "../src/lib/sales-orders/fabric-line-delete-requests.ts"
);
const { notifyAdminsOfFabricLineDeleteRequest } = await import(
  "../src/lib/integrations/fabric-line-delete-request-alert.ts"
);

await ensureDocumentsLoaded([
  "clients",
  "sales_orders",
  "sewing_session_change_requests",
]);
await ensureFabricOrdersLoaded();

const names = listPendingClientNameChangeRequests();
const sewingStore = await readSewingSessionChangeRequestsFresh();
const sewing = listPendingSewingSessionChangeRequests(sewingStore);
const fabric = listPendingFabricLineDeleteRequests();

console.log(
  JSON.stringify(
    {
      name_changes: names.map((row) => `${row.client_code} ${row.current_name} -> ${row.proposed_name}`),
      sewing: sewing.map((row) => `${row.action} ${row.id} by ${row.requested_by}`),
      fabric: fabric.map((row) => `${row.so_number} ${row.fabric_number} by ${row.delete_requested_by}`),
    },
    null,
    2
  )
);

let sent = 0;
for (const row of names) {
  if (await notifyAdminsOfClientNameChangeRequest(row)) sent += 1;
}
for (const row of sewing) {
  if (await notifyAdminsOfSewingSessionChangeRequest(row)) sent += 1;
}
for (const row of fabric) {
  if (await notifyAdminsOfFabricLineDeleteRequest(row)) sent += 1;
}
console.log("emailed", sent, "pending request(s)");
