#!/usr/bin/env node
/**
 * Restore production fabric_orders after an empty overwrite.
 *
 * Sources:
 * 1) fabric-orders.local.json (authoritative emailed_at where present)
 * 2) Rebuild missing POs from sales_orders.fabric_po_ids + fabric_lines
 * 3) Mark sent when supplier_replies / shipments reference the PO
 *
 *   node scripts/restore-wiped-fabric-orders.mjs --dry-run
 *   node scripts/restore-wiped-fabric-orders.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value.replace(/^["']|["']$/g, "");
  }
}

loadEnvLocal();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

function fabricPoSupplierId(supplierId, fabricNumber) {
  const id = String(supplierId || "").toLowerCase();
  if (id === "solbiati") return "loro-piana";
  if (id === "loro-piana" && /^S/i.test(String(fabricNumber || "").trim())) return "loro-piana";
  return id || "unknown";
}

async function loadDocument(key) {
  const { data, error } = await supabase
    .from("erp_documents")
    .select("data, updated_at")
    .eq("id", key)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function saveDocument(key, content) {
  const { error } = await supabase.from("erp_documents").upsert(
    { id: key, data: content, updated_at: new Date().toISOString() },
    { onConflict: "id" }
  );
  if (error) throw error;
}

function readLocalJson(rel, fallback) {
  try {
    return JSON.parse(readFileSync(resolve(process.cwd(), rel), "utf8"));
  } catch {
    return fallback;
  }
}

function buildSupplier(contacts, supplierId, hint) {
  const row = (contacts.suppliers || []).find((s) => s.id === supplierId);
  return {
    id: supplierId,
    code: row?.code ?? hint?.po_number ?? supplierId.toUpperCase(),
    name: row?.name ?? supplierId,
    email: row?.emails?.join(", ") ?? row?.email ?? null,
    emails: row?.emails ?? (row?.email ? [row.email] : []),
    country: row?.country ?? null,
    contact_person: row?.contact_person ?? null,
    lead_time_days: row?.lead_time_days ?? 14,
    is_fabric_supplier: true,
  };
}

function linesFromSalesOrder(order, poId, supplierId) {
  const clientReference =
    order.client_reference ?? `${order.client_code}-${order.so_number}`;
  const lines = (order.fabric_lines || []).filter((line) => {
    if (!supplierId) return true;
    return fabricPoSupplierId(line.supplier_id, line.fabric_number) === supplierId;
  });
  return lines.map((line, index) => ({
    id: `${poId}-line-${index + 1}`,
    fabric_number: line.fabric_number,
    quantity_ordered: line.quantity,
    unit_price: line.unit_price ?? 0,
    label_count: line.label_count ?? null,
    label_stickers: line.label_stickers ?? null,
    garment_type: line.garment_type ?? null,
    client_reference: clientReference,
    emailed_at: null,
  }));
}

function markPoSent(po, emailedAt) {
  const at = emailedAt || new Date().toISOString();
  po.emailed_at = at;
  po.status = "sent";
  for (const line of po.lines || []) {
    if (!line.cancelled_at) line.emailed_at = at;
  }
}

async function main() {
  const local = readLocalJson("fabric-orders.local.json", { orders: [] });
  const contacts = readLocalJson("src/data/suppliers/contacts.json", { suppliers: [] });
  const remoteRow = await loadDocument("fabric_orders");
  const salesRow = await loadDocument("sales_orders");
  const repliesRow = await loadDocument("supplier_replies");
  const shipmentsRow = await loadDocument("shipments");

  const remoteOrders = remoteRow?.data?.orders || [];
  const salesOrders = salesRow?.data?.orders || [];
  const replies = repliesRow?.data?.replies || [];
  const shipments = shipmentsRow?.data?.shipments || [];

  console.log({
    remote_count: remoteOrders.length,
    local_count: local.orders?.length || 0,
    dry_run: DRY_RUN,
    remote_updated_at: remoteRow?.updated_at,
  });

  const evidence = new Map();
  for (const r of replies) {
    const id = r.purchase_order_id;
    if (!id) continue;
    const prev = evidence.get(id) || {};
    evidence.set(id, {
      po_number: r.po_number || prev.po_number || null,
      supplier_id: r.supplier_id || prev.supplier_id || null,
      emailed_at: prev.emailed_at || r.received_at || null,
      source: "supplier_reply",
    });
  }
  for (const s of shipments) {
    const id = s.purchase_order_id || s.fabric_po_id || s.po_id;
    if (!id) continue;
    const prev = evidence.get(id) || {};
    evidence.set(id, {
      po_number: s.po_number || prev.po_number || null,
      supplier_id: prev.supplier_id || null,
      emailed_at: prev.emailed_at || s.created_at || null,
      source: prev.source || "shipment",
    });
  }

  const byId = new Map();
  for (const po of remoteOrders) byId.set(po.id, po);
  for (const po of local.orders || []) {
    const existing = byId.get(po.id);
    if (!existing) {
      byId.set(po.id, structuredClone(po));
      continue;
    }
    // Prefer local emailed markers when remote is empty/stale.
    if (po.emailed_at && !existing.emailed_at) {
      byId.set(po.id, structuredClone(po));
    }
  }

  const needed = new Map(); // poId -> sales order
  for (const order of salesOrders) {
    for (const poId of order.fabric_po_ids || []) {
      if (!needed.has(poId)) needed.set(poId, order);
    }
  }

  let rebuilt = 0;
  let markedSentFromEvidence = 0;

  // Rebuild missing POs grouped by sales order for cleaner supplier matching.
  const missingBySo = new Map();
  for (const [poId, order] of needed) {
    if (byId.has(poId)) continue;
    const list = missingBySo.get(order.id) || [];
    list.push(poId);
    missingBySo.set(order.id, list);
  }

  for (const [soId, poIds] of missingBySo) {
    const order = salesOrders.find((o) => o.id === soId);
    if (!order) continue;

    const groups = new Map();
    for (const line of order.fabric_lines || []) {
      const sid = fabricPoSupplierId(line.supplier_id, line.fabric_number);
      const bucket = groups.get(sid) || [];
      bucket.push(line);
      groups.set(sid, bucket);
    }

    const unusedSuppliers = new Set(groups.keys());
    const assigned = new Map(); // poId -> supplierId

    for (const poId of poIds) {
      const ev = evidence.get(poId);
      if (ev?.supplier_id && unusedSuppliers.has(ev.supplier_id)) {
        assigned.set(poId, ev.supplier_id);
        unusedSuppliers.delete(ev.supplier_id);
      } else if (ev?.supplier_id === "solbiati" && unusedSuppliers.has("loro-piana")) {
        assigned.set(poId, "loro-piana");
        unusedSuppliers.delete("loro-piana");
      }
    }

    // Single missing PO and one unused supplier group (or only one group total).
    if (poIds.length === 1 && unusedSuppliers.size >= 1 && !assigned.has(poIds[0])) {
      const only = [...unusedSuppliers][0];
      assigned.set(poIds[0], only);
      unusedSuppliers.delete(only);
    }

    // Match remaining POs to remaining supplier groups 1:1 (no duplicate line assignment).
    const remainingPoIds = poIds.filter((id) => !assigned.has(id));
    const remainingSuppliers = [...unusedSuppliers].sort();
    for (let i = 0; i < remainingPoIds.length; i++) {
      assigned.set(remainingPoIds[i], remainingSuppliers[i] || null);
    }

    let seq = 1;
    const usedSupplierForLines = new Set();
    for (const poId of poIds) {
      const ev = evidence.get(poId);
      let supplierId = assigned.get(poId);
      let lines;
      if (poIds.length === 1) {
        lines = linesFromSalesOrder(order, poId, null);
        supplierId =
          supplierId ||
          fabricPoSupplierId(
            order.fabric_lines?.[0]?.supplier_id || "unknown",
            order.fabric_lines?.[0]?.fabric_number || ""
          );
      } else if (supplierId && !usedSupplierForLines.has(supplierId)) {
        lines = linesFromSalesOrder(order, poId, supplierId);
        usedSupplierForLines.add(supplierId);
      } else {
        // Extra PO id without a unique supplier bucket — keep stub for link integrity.
        lines = [];
        supplierId = supplierId || ev?.supplier_id || "unknown";
      }

      const poNumber = ev?.po_number || `PO-2026-${String(9000 + seq).padStart(4, "0")}`;
      seq += 1;
      const resolvedSupplierId = supplierId || "unknown";

      const po = {
        id: poId,
        po_number: poNumber,
        supplier_id: resolvedSupplierId,
        status: "draft",
        order_date: (order.fabric_order_requested_at || order.order_date || "").slice(0, 10) || "2026-06-01",
        expected_date: null,
        total_amount: lines.reduce((sum, line) => sum + line.quantity_ordered * (line.unit_price || 0), 0),
        client_reference: order.client_reference ?? `${order.client_code}-${order.so_number}`,
        emailed_at: null,
        email_to: null,
        expected_carrier: "DHL",
        sales_order_id: order.id,
        supplier: buildSupplier(contacts, resolvedSupplierId, ev),
        lines,
        recovered_at: new Date().toISOString(),
        recovered_note: "Rebuilt after fabric_orders empty overwrite (2026-08-02)",
      };

      if (ev?.emailed_at) {
        markPoSent(po, ev.emailed_at);
        markedSentFromEvidence += 1;
      }

      byId.set(poId, po);
      rebuilt += 1;
      console.log(
        `rebuild ${po.po_number} ${poId} so=${order.so_number} supplier=${po.supplier_id} lines=${po.lines.length} sent=${Boolean(po.emailed_at)}`
      );
    }
  }

  // Apply evidence to existing/local POs that lack emailed_at.
  for (const [poId, ev] of evidence) {
    const po = byId.get(poId);
    if (!po || po.emailed_at) continue;
    markPoSent(po, ev.emailed_at);
    if (ev.po_number && String(po.po_number).startsWith("PO-2026-9")) {
      po.po_number = ev.po_number;
    }
    markedSentFromEvidence += 1;
    console.log(`mark-sent-from-evidence ${po.po_number} ${poId} via ${ev.source}`);
  }

  const merged = [...byId.values()].sort((a, b) =>
    String(a.po_number || a.id).localeCompare(String(b.po_number || b.id))
  );

  const sent = merged.filter((o) => o.emailed_at && o.status !== "cancelled");
  const pending = merged.filter((o) => !o.emailed_at && o.status !== "cancelled");
  console.log(
    JSON.stringify(
      {
        total: merged.length,
        sent: sent.length,
        pending: pending.length,
        rebuilt,
        markedSentFromEvidence,
      },
      null,
      2
    )
  );

  console.log("--- SENT ---");
  for (const o of sent) {
    console.log(
      `${o.po_number} | ${o.supplier_id} | ${o.emailed_at} | ${o.client_reference || ""} | lines=${(o.lines || []).length}`
    );
  }
  console.log("--- PENDING ---");
  for (const o of pending) {
    console.log(
      `${o.po_number} | ${o.supplier_id} | ${o.client_reference || ""} | lines=${(o.lines || []).length} | ${o.id}`
    );
  }

  const stillMissing = [...needed.keys()].filter((id) => !byId.has(id));
  if (stillMissing.length) {
    console.error("Still missing PO ids:", stillMissing);
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("Dry run  not writing Supabase or local file.");
    return;
  }

  const payload = { orders: merged };
  await saveDocument("fabric_orders", payload);
  writeFileSync(
    resolve(process.cwd(), "fabric-orders.local.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8"
  );
  console.log(`Saved ${merged.length} fabric POs to Supabase + fabric-orders.local.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
