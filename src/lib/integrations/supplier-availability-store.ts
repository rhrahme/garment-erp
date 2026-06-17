import path from "path";
import { readJsonFile, writeJsonFile } from "@/lib/data/json-file-cache";
import { getSupplierByIdFromContactsSync } from "@/lib/data/supplier-contacts";
import { getSalesOrderById } from "@/lib/data/sales-orders";
import { resolveClientNameForFabricPo } from "@/lib/integrations/fabric-po-client";
import { getStoredFabricOrder } from "@/lib/integrations/fabric-order-store";
import type { SupplierLineUpdate } from "@/lib/integrations/supplier-reply-store";

const STORE_PATH = path.join(process.cwd(), "supplier-availability-alerts.local.json");

export type AvailabilityResolution = "pending" | "wait" | "replace" | "dismissed";

export interface SupplierAvailabilityAlert {
  id: string;
  reply_id: string;
  po_number: string | null;
  purchase_order_id: string | null;
  sales_order_id: string | null;
  sales_order_number: string | null;
  client_reference: string | null;
  client_name: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  fabric_number: string;
  status: SupplierLineUpdate["status"];
  restock_date: string | null;
  substitute_fabric_number: string | null;
  note: string | null;
  email_subject: string;
  detected_at: string;
  resolution: AvailabilityResolution;
  resolution_note: string | null;
  resolved_at: string | null;
  alert_emailed_at: string | null;
}

interface AvailabilityStore {
  alerts: SupplierAvailabilityAlert[];
}

function readStore(): AvailabilityStore {
  return readJsonFile(STORE_PATH, { alerts: [] });
}

function writeStore(store: AvailabilityStore): void {
  writeJsonFile(STORE_PATH, store);
}

function enrichAvailabilityAlertClientName(alert: SupplierAvailabilityAlert): SupplierAvailabilityAlert {
  if (alert.client_name) return alert;
  const client_name = resolveClientNameForFabricPo({
    purchase_order_id: alert.purchase_order_id,
    po_number: alert.po_number,
  });
  return client_name ? { ...alert, client_name } : alert;
}

export function listSupplierAvailabilityAlerts(options?: {
  pendingOnly?: boolean;
  limit?: number;
}): SupplierAvailabilityAlert[] {
  const limit = options?.limit ?? 200;
  let alerts = readStore().alerts;
  if (options?.pendingOnly) {
    alerts = alerts.filter((alert) => alert.resolution === "pending");
  }
  return alerts.slice(0, limit).map(enrichAvailabilityAlertClientName);
}

export function countPendingAvailabilityAlerts(): number {
  return readStore().alerts.filter((alert) => alert.resolution === "pending").length;
}

export function getSupplierAvailabilityAlert(id: string): SupplierAvailabilityAlert | undefined {
  return readStore().alerts.find((alert) => alert.id === id);
}

export function resolveSupplierAvailabilityAlert(
  id: string,
  resolution: Exclude<AvailabilityResolution, "pending">,
  resolution_note?: string | null
): SupplierAvailabilityAlert | null {
  const store = readStore();
  const index = store.alerts.findIndex((alert) => alert.id === id);
  if (index < 0) return null;

  const updated: SupplierAvailabilityAlert = {
    ...store.alerts[index],
    resolution,
    resolution_note: resolution_note?.trim() || null,
    resolved_at: new Date().toISOString(),
  };
  store.alerts[index] = updated;
  writeStore(store);
  return updated;
}

function alertKey(replyId: string, fabricNumber: string): string {
  return `${replyId}::${fabricNumber.trim().toUpperCase()}`;
}

export function createAvailabilityAlertsFromReply(input: {
  reply_id: string;
  po_number: string | null;
  purchase_order_id: string | null;
  supplier_id: string | null;
  email_subject: string;
  line_updates: SupplierLineUpdate[];
}): SupplierAvailabilityAlert[] {
  const unavailable = input.line_updates.filter(
    (line) =>
      line.status === "temp_unavailable" ||
      line.status === "permanently_unavailable" ||
      line.status === "substituted"
  );
  if (unavailable.length === 0) return [];

  const store = readStore();
  const existingKeys = new Set(store.alerts.map((alert) => alertKey(alert.reply_id, alert.fabric_number)));
  const po = input.purchase_order_id ? getStoredFabricOrder(input.purchase_order_id) : null;
  const salesOrder = po?.sales_order_id ? getSalesOrderById(po.sales_order_id) : null;
  const supplier = input.supplier_id ? getSupplierByIdFromContactsSync(input.supplier_id) : null;
  const created: SupplierAvailabilityAlert[] = [];

  for (const line of unavailable) {
    const key = alertKey(input.reply_id, line.fabric_number);
    if (existingKeys.has(key)) continue;

    const alert: SupplierAvailabilityAlert = {
      id: `avail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      reply_id: input.reply_id,
      po_number: input.po_number,
      purchase_order_id: input.purchase_order_id,
      sales_order_id: po?.sales_order_id ?? null,
      sales_order_number: salesOrder?.so_number ?? null,
      client_reference: po?.client_reference ?? salesOrder?.client_reference ?? null,
      client_name: salesOrder?.client_name ?? null,
      supplier_id: input.supplier_id,
      supplier_name: supplier?.name ?? null,
      fabric_number: line.fabric_number,
      status: line.status,
      restock_date: line.restock_date ?? null,
      substitute_fabric_number: line.substitute_fabric_number ?? null,
      note: line.note ?? null,
      email_subject: input.email_subject,
      detected_at: new Date().toISOString(),
      resolution: "pending",
      resolution_note: null,
      resolved_at: null,
      alert_emailed_at: null,
    };

    store.alerts.unshift(alert);
    existingKeys.add(key);
    created.push(alert);
  }

  if (created.length > 0) {
    writeStore(store);
  }

  return created;
}

export function markAvailabilityAlertsEmailed(ids: string[]): void {
  if (ids.length === 0) return;
  const store = readStore();
  const idSet = new Set(ids);
  store.alerts = store.alerts.map((alert) =>
    idSet.has(alert.id) ? { ...alert, alert_emailed_at: new Date().toISOString() } : alert
  );
  writeStore(store);
}
