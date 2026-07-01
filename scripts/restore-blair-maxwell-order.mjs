#!/usr/bin/env node
/**
 * Restore Blair Maxwell (GL-0526-0002 / SO-2026-0005) from ClickUp.
 * The SO was incorrectly trimmed to 4 fabric lines; ClickUp has 13 garments.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SO_ID = "so-cu-86exhyjr1";
const SO_NUMBER = "SO-2026-0005";
const CLIENT_ID = "cu-blair-maxwell-gliani";
const CLICKUP_ROOT = "86exhyjr1";
const CLICKUP_SUBTASKS = [
  "86exhyjrz",
  "86exhyjt6",
  "86exhyjtb",
  "86extb6b6",
  "86extb6b9",
  "86extb6h0",
  "86extb6h7",
  "86extb6hd",
  "86extb6j3",
  "86extb6jq",
  "86extb6ka",
  "86exu59x9",
];
const INVOICE_NUMBER = "INV-2026-0006";
const force = process.argv.includes("--force");

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
    if (!(key in process.env)) process.env[key] = value;
  }
}

function getDropdown(fields, name) {
  const f = fields?.find((x) => x.name === name);
  if (f?.value == null && f?.value !== 0) return null;
  const opt = f.type_config?.options?.find((o) => o.orderindex === f.value);
  return opt?.name ?? String(f.value);
}

function getText(fields, name) {
  const f = fields?.find((x) => x.name === name);
  return f?.value ?? null;
}

function getNumber(fields, name) {
  const f = fields?.find((x) => x.name === name);
  if (f?.value == null) return null;
  const n = Number(f.value);
  return Number.isFinite(n) ? n : null;
}

function mapClickUpSupplier(fabricBrand) {
  if (!fabricBrand) return { id: "unknown", name: "Unknown" };
  const normalized = fabricBrand.trim().toLowerCase();
  const map = {
    drapers: { id: "drapers", name: "Drapers" },
    stylbiella: { id: "stylbiella", name: "Stylbiella" },
    stock: { id: "canclini", name: "Canclini" },
    canclini: { id: "canclini", name: "Canclini" },
    gl: { id: "canclini", name: "Canclini" },
  };
  return map[normalized] ?? { id: normalized.replace(/\s+/g, "-"), name: fabricBrand.trim() };
}

function mapClickUpItemToGarmentType(item) {
  if (!item) return "Trouser";
  const normalized = item.trim().toLowerCase();
  if (normalized.includes("blazer") || normalized.includes("jacket")) return "Jacket";
  if (normalized.includes("trouser")) return "Trouser";
  if (normalized.includes("shirt")) return "Shirt LS";
  return item.replace(/\s*\([^)]*\)\s*$/, "").trim() || "Trouser";
}

function normalizeFabricNumber(raw) {
  if (!raw) return "";
  return raw.trim().replace(/^N/i, "");
}

function normFabricKey(raw) {
  return normalizeFabricNumber(raw).replace(/^C/i, "").toLowerCase();
}

function lineMatchKey(line) {
  return `${normFabricKey(line.fabric_number)}|${line.garment_type ?? ""}`;
}

function indexExistingLines(lines) {
  const byLineId = new Map();
  const byMatch = new Map();
  for (const line of lines ?? []) {
    byLineId.set(line.id, line);
    byMatch.set(lineMatchKey(line), line);
  }
  return { byLineId, byMatch };
}

function findExistingLine(existing, candidate) {
  return (
    existing.byLineId.get(candidate.id) ??
    existing.byMatch.get(lineMatchKey(candidate)) ??
    null
  );
}

function preservedUnitPrice(existingLine) {
  const price = existingLine?.unit_price;
  return typeof price === "number" && price > 0 ? price : 0;
}

const PIECE_ABBREV = {
  Jacket: "JKT",
  Trouser: "TR",
  "Shirt LS": "SHT-LS",
};

function generateFabricLabelStickers(clientReference, lineIndex, garmentType, pieceName) {
  const linePart = `L${String(lineIndex).padStart(2, "0")}`;
  const abbrev = PIECE_ABBREV[garmentType] ?? garmentType.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase();
  return [
    {
      code: `${clientReference}-${linePart}-${abbrev}`,
      piece_name: pieceName.split("(")[0].trim() || garmentType,
      sequence: 1,
    },
  ];
}

function buildFabricLine(task, clientReference, lineIndex, existingLine) {
  const item = getDropdown(task.custom_fields, "Item");
  const garment_type = mapClickUpItemToGarmentType(item);
  const fabric_number = normalizeFabricNumber(getText(task.custom_fields, "Fabric Number")) || "TBD";
  let supplier = mapClickUpSupplier(getDropdown(task.custom_fields, "Fabric Brand"));
  if (fabric_number === "C1411635-1") {
    supplier = { id: "gliani-stock", name: "Gliani Stock" };
  }
  const quantity = getNumber(task.custom_fields, "Unit") ?? existingLine?.quantity ?? 1;
  const label_stickers = generateFabricLabelStickers(
    clientReference,
    lineIndex,
    garment_type,
    item ?? garment_type
  );
  return {
    ...(existingLine ?? {}),
    id: `line-cu-${task.id}`,
    garment_type,
    label_count: label_stickers.length,
    label_stickers,
    supplier_id: supplier.id,
    supplier_name: supplier.name,
    fabric_number,
    quantity,
    unit: "meters",
    unit_price: preservedUnitPrice(existingLine),
    composition: getText(task.custom_fields, "Composition") ?? existingLine?.composition ?? null,
    weight_gsm: getNumber(task.custom_fields, "Weight (grms)") ?? existingLine?.weight_gsm ?? null,
    width_cm: existingLine?.width_cm ?? null,
    width_inches: existingLine?.width_inches ?? null,
    color: getDropdown(task.custom_fields, "Color") ?? existingLine?.color ?? null,
  };
}

async function fetchClickUpTask(token, id) {
  const res = await fetch(`https://api.clickup.com/api/v2/task/${id}`, {
    headers: { Authorization: token },
  });
  if (!res.ok) throw new Error(`ClickUp ${id}: ${res.status}`);
  return res.json();
}

async function fetchDoc(admin, id) {
  const { data, error } = await admin.from("erp_documents").select("data").eq("id", id).single();
  if (error) throw new Error(`Fetch ${id}: ${error.message}`);
  return data.data;
}

async function syncDoc(admin, id, data) {
  const updated_at = new Date().toISOString();
  const payload = { ...data, updated_at: data.updated_at ?? updated_at };
  const { error } = await admin
    .from("erp_documents")
    .upsert({ id, data: payload, updated_at }, { onConflict: "id" });
  if (error) throw new Error(`Supabase upsert ${id} failed: ${error.message}`);
  return payload;
}

function pieceNameForLine(line) {
  return line.label_stickers?.[0]?.piece_name ?? line.garment_type;
}

function jobFieldsFromLine(order, line, articleNumber) {
  return {
    sales_order_id: order.id,
    sales_order_line_id: line.id,
    so_number: order.so_number,
    client_id: order.client_id,
    client_name: order.client_name,
    client_code: order.client_code,
    garment_type: line.garment_type,
    piece_name: pieceNameForLine(line),
    article_number: articleNumber,
    fabric_number: line.fabric_number,
    supplier: line.supplier_name,
    composition: line.composition,
    gsm: line.weight_gsm,
    width_cm: line.width_cm,
    width_inches: line.width_inches,
    color: line.color,
    meters: line.quantity,
  };
}

function syncPatternJobs(store, order) {
  const now = new Date().toISOString();
  const created = [];
  const updated = [];
  const cancelled = [];
  const reactivated = [];

  const existingForOrder = store.jobs.filter((job) => job.sales_order_id === order.id);
  const lineIds = new Set(order.fabric_lines.map((line) => line.id));
  const usedJobIds = new Set();

  for (const [index, line] of order.fabric_lines.entries()) {
    const articleNumber = index + 1;
    const fields = jobFieldsFromLine(order, line, articleNumber);
    const fabricKey = normFabricKey(line.fabric_number);

    let existing =
      existingForOrder.find(
        (job) => !usedJobIds.has(job.id) && normFabricKey(job.fabric_number) === fabricKey
      ) ??
      existingForOrder.find(
        (job) => !usedJobIds.has(job.id) && job.sales_order_line_id === line.id
      );

    if (existing) {
      usedJobIds.add(existing.id);
      const nextJob = {
        ...existing,
        ...fields,
        status: "pending",
        updated_at: now,
      };
      const wasCancelled = existing.status === "cancelled";
      if (wasCancelled) reactivated.push(existing.id);
      if (
        existing.fabric_number !== nextJob.fabric_number ||
        existing.garment_type !== nextJob.garment_type ||
        existing.sales_order_line_id !== nextJob.sales_order_line_id ||
        existing.article_number !== nextJob.article_number ||
        wasCancelled
      ) {
        updated.push(existing.id);
      }
      const jobIndex = store.jobs.findIndex((job) => job.id === existing.id);
      if (jobIndex >= 0) store.jobs[jobIndex] = nextJob;
    } else {
      const id = `pj-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
      const job = {
        id,
        ...fields,
        status: "pending",
        assigned_to: null,
        pattern_code: null,
        pattern_size_notes: null,
        trial_priority: false,
        blocked_reason: null,
        notes: null,
        fittings: [],
        revisions: [],
        created_at: now,
        updated_at: now,
      };
      store.jobs.unshift(job);
      created.push(id);
    }
  }

  for (const job of existingForOrder) {
    if (usedJobIds.has(job.id)) continue;
    if (job.status === "cancelled" || job.status === "completed") continue;
    const jobIndex = store.jobs.findIndex((item) => item.id === job.id);
    if (jobIndex < 0) continue;
    store.jobs[jobIndex] = { ...store.jobs[jobIndex], status: "cancelled", updated_at: now };
    cancelled.push(job.id);
  }

  store.updated_at = now;
  return { created, updated, cancelled, reactivated };
}

async function main() {
  loadEnvLocal();
  const clickupToken = process.env.CLICKUP_API_TOKEN?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.SUPABASE_SECRET_KEY?.trim();
  if (!clickupToken) throw new Error("Missing CLICKUP_API_TOKEN");
  if (!url || !key) throw new Error("Missing Supabase credentials");

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const root = await fetchClickUpTask(clickupToken, CLICKUP_ROOT);
  const subtasks = [];
  for (const id of CLICKUP_SUBTASKS) {
    subtasks.push(await fetchClickUpTask(clickupToken, id));
  }
  const clickupTasks = [root, ...subtasks];

  const soStore = await fetchDoc(admin, "sales_orders");
  const pjStore = await fetchDoc(admin, "pattern_jobs");
  const invStore = await fetchDoc(admin, "customer_invoices");

  const orderIndex = soStore.orders.findIndex((o) => o.id === SO_ID || o.so_number === SO_NUMBER);
  if (orderIndex < 0) throw new Error(`${SO_NUMBER} not found`);

  const order = soStore.orders[orderIndex];
  const clientReference = order.client_reference ?? `${order.client_code}-${SO_NUMBER}`;
  const existingSoLines = indexExistingLines(order.fabric_lines);
  const fabric_lines = clickupTasks.map((task, index) => {
    const draft = {
      id: `line-cu-${task.id}`,
      garment_type: mapClickUpItemToGarmentType(getDropdown(task.custom_fields, "Item")),
      fabric_number:
        normalizeFabricNumber(getText(task.custom_fields, "Fabric Number")) || "TBD",
    };
    const existingLine = findExistingLine(existingSoLines, draft);
    return buildFabricLine(task, clientReference, index + 1, existingLine);
  });
  const preservedSoPrices = fabric_lines.filter((line) => line.unit_price > 0).length;

  const restoredOrder = { ...order, fabric_lines };
  soStore.orders[orderIndex] = restoredOrder;

  const beforeJobs = pjStore.jobs.filter(
    (j) => j.sales_order_id === SO_ID && j.status !== "cancelled"
  );
  const pjResult = syncPatternJobs(pjStore, restoredOrder);

  if (pjResult.cancelled.length > 0 && !force) {
    throw new Error(
      `Would cancel ${pjResult.cancelled.length} pattern job(s): ${pjResult.cancelled.join(", ")}. Re-run with --force to confirm.`
    );
  }

  const afterJobs = pjStore.jobs.filter(
    (j) => j.sales_order_id === SO_ID && j.status !== "cancelled"
  );

  const invIndex = invStore.invoices.findIndex((i) => i.invoice_number === INVOICE_NUMBER);
  let invoiceNote = "not found";
  let preservedInvPrices = 0;
  if (invIndex >= 0) {
    const inv = invStore.invoices[invIndex];
    const existingInvLines = indexExistingLines(
      inv.lines?.map((line) => ({
        ...line,
        garment_type: line.garment_type,
        fabric_number: line.fabric_number,
      })) ?? []
    );
    const relinkedLines =
      inv.lines?.map((line) => {
        const fabricLine = restoredOrder.fabric_lines.find(
          (fl) =>
            fl.id === line.sales_order_line_id ||
            normFabricKey(fl.fabric_number) === normFabricKey(line.fabric_number)
        );
        if (!fabricLine) return line;
        const articleIndex = restoredOrder.fabric_lines.findIndex((fl) => fl.id === fabricLine.id);
        const existingInvLine = findExistingLine(existingInvLines, {
          id: line.id,
          garment_type: line.garment_type,
          fabric_number: line.fabric_number,
        });
        const unit_price = preservedUnitPrice(existingInvLine ?? line);
        const quantity = line.quantity ?? 1;
        if (unit_price > 0) preservedInvPrices += 1;
        return {
          ...line,
          sales_order_line_id: fabricLine.id,
          article_number: articleIndex + 1,
          sticker_code: fabricLine.label_stickers?.[0]?.code ?? line.sticker_code,
          fabric_number: fabricLine.fabric_number,
          composition: fabricLine.composition ?? line.composition,
          unit_price,
          line_total: Math.round(unit_price * quantity * 100) / 100,
        };
      }) ?? [];
    const subtotal = Math.round(
      relinkedLines.reduce((sum, line) => sum + (line.line_total ?? 0), 0) * 100
    ) / 100;
    const vatRate = inv.vat_rate ?? 0;
    const vat_amount =
      vatRate > 0 ? Math.round(subtotal * vatRate * 100) / 100 : inv.vat_amount ?? 0;
    invStore.invoices[invIndex] = {
      ...inv,
      lines: relinkedLines,
      subtotal,
      vat_amount,
      total: Math.round((subtotal + vat_amount) * 100) / 100,
    };
    invoiceNote = `invoice lines ${relinkedLines.length} (${preservedInvPrices} priced lines preserved)`;
  }

  await syncDoc(admin, "sales_orders", soStore);
  await syncDoc(admin, "pattern_jobs", pjStore);
  if (invIndex >= 0) await syncDoc(admin, "customer_invoices", invStore);

  writeFileSync(resolve("src/data/sales-orders.json"), `${JSON.stringify(soStore, null, 2)}\n`);
  writeFileSync(resolve("src/data/pattern-jobs.json"), `${JSON.stringify(pjStore, null, 2)}\n`);
  if (invIndex >= 0) {
    writeFileSync(
      resolve("src/data/customer-invoices.json"),
      `${JSON.stringify(invStore, null, 2)}\n`
    );
  }

  const breakdown = {};
  for (const line of fabric_lines) {
    breakdown[line.garment_type] = (breakdown[line.garment_type] || 0) + 1;
  }

  console.log(
    JSON.stringify(
      {
        client: order.client_name,
        client_code: order.client_code,
        sales_orders: 1,
        so_number: SO_NUMBER,
        clickup_garments: fabric_lines.length,
        garment_breakdown: breakdown,
        so_fabric_lines_before: order.fabric_lines.length,
        so_fabric_lines_after: fabric_lines.length,
        pattern_jobs_before: beforeJobs.length,
        pattern_jobs_after: afterJobs.length,
        pattern_jobs_reactivated: pjResult.reactivated.length,
        pattern_jobs_created: pjResult.created.length,
        preserved_so_unit_prices: preservedSoPrices,
        preserved_invoice_unit_prices: preservedInvPrices,
        invoice: invoiceNote,
        fabric_lines: fabric_lines.map((l, i) => ({
          article: i + 1,
          id: l.id,
          garment: l.garment_type,
          fabric: l.fabric_number,
          color: l.color,
        })),
        active_jobs: afterJobs.map((j) => ({
          article: j.article_number,
          garment: j.garment_type,
          fabric: j.fabric_number,
          line: j.sales_order_line_id,
        })),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
