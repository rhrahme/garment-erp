import path from "path";
import {
  readJsonFile,
  readJsonFileFresh,
  readJsonFileFreshAsync,
  saveDocument,
} from "@/lib/data/document-persistence";
import type {
  FabricChangeAlert,
  FabricChangeAlertRole,
  FabricChangeAlertsFile,
} from "@/lib/types/fabric-change-alerts";
import { FABRIC_CHANGE_ALERT_ROLES } from "@/lib/types/fabric-change-alerts";

const STORE_PATH = path.join(process.cwd(), "src/data/fabric-change-alerts.json");
const EMPTY: FabricChangeAlertsFile = { updated_at: null, alerts: [] };

export function readFabricChangeAlerts(): FabricChangeAlertsFile {
  return readJsonFile(STORE_PATH, EMPTY);
}

export function readFabricChangeAlertsFresh(): FabricChangeAlertsFile {
  return readJsonFileFresh(STORE_PATH, EMPTY);
}

export async function readFabricChangeAlertsFreshAsync(): Promise<FabricChangeAlertsFile> {
  return readJsonFileFreshAsync(STORE_PATH, EMPTY, { force: true });
}

export async function writeFabricChangeAlerts(
  data: FabricChangeAlertsFile
): Promise<FabricChangeAlertsFile> {
  const payload: FabricChangeAlertsFile = {
    ...data,
    updated_at: new Date().toISOString(),
  };
  return saveDocument(STORE_PATH, payload);
}

export async function appendFabricChangeAlert(alert: FabricChangeAlert): Promise<FabricChangeAlert> {
  const store = structuredClone(await readFabricChangeAlertsFreshAsync());
  store.alerts.unshift(alert);
  await writeFabricChangeAlerts(store);
  return alert;
}

export function isFabricChangeAcknowledgedByRole(
  alert: FabricChangeAlert,
  role: FabricChangeAlertRole
): boolean {
  return alert.acknowledgements[role] != null;
}

export function isFabricChangeFullyAcknowledged(alert: FabricChangeAlert): boolean {
  return FABRIC_CHANGE_ALERT_ROLES.every((role) => isFabricChangeAcknowledgedByRole(alert, role));
}

export function listFabricChangeAlerts(limit = 50): FabricChangeAlert[] {
  return readFabricChangeAlertsFresh().alerts.slice(0, limit);
}

export function listFabricChangeAlertsForClient(clientId: string, limit = 50): FabricChangeAlert[] {
  const trimmed = clientId.trim();
  if (!trimmed) return [];
  return readFabricChangeAlertsFresh()
    .alerts.filter((alert) => alert.client_id === trimmed)
    .slice(0, limit);
}

export function listFabricChangeAlertsForSalesOrder(salesOrderId: string): FabricChangeAlert[] {
  return readFabricChangeAlertsFresh().alerts.filter(
    (alert) => alert.sales_order_id === salesOrderId
  );
}

export function listOutstandingFabricChangeAlertsForRole(
  role: FabricChangeAlertRole,
  limit = 50
): FabricChangeAlert[] {
  return readFabricChangeAlertsFresh()
    .alerts.filter((alert) => !isFabricChangeAcknowledgedByRole(alert, role))
    .slice(0, limit);
}

export function listOutstandingFabricChangeAlertsForClient(
  clientId: string,
  role?: FabricChangeAlertRole,
  limit = 50
): FabricChangeAlert[] {
  const trimmed = clientId.trim();
  if (!trimmed) return [];
  return readFabricChangeAlertsFresh()
    .alerts.filter((alert) => {
      if (alert.client_id !== trimmed) return false;
      if (!role) return !isFabricChangeFullyAcknowledged(alert);
      return !isFabricChangeAcknowledgedByRole(alert, role);
    })
    .slice(0, limit);
}

export function countOutstandingFabricChangeAlertsForRole(role: FabricChangeAlertRole): number {
  return readFabricChangeAlertsFresh().alerts.filter(
    (alert) => !isFabricChangeAcknowledgedByRole(alert, role)
  ).length;
}

export async function markFabricChangeAlertAcknowledged(
  alertId: string,
  role: FabricChangeAlertRole,
  acknowledgedBy: string
): Promise<{ alert: FabricChangeAlert; newlyAcknowledged: boolean } | null> {
  const store = structuredClone(await readFabricChangeAlertsFreshAsync());
  const index = store.alerts.findIndex((alert) => alert.id === alertId);
  if (index < 0) return null;

  const existing = store.alerts[index]!;
  if (existing.acknowledgements[role]) {
    return { alert: existing, newlyAcknowledged: false };
  }

  const updated: FabricChangeAlert = {
    ...existing,
    acknowledgements: {
      ...existing.acknowledgements,
      [role]: {
        at: new Date().toISOString(),
        by: acknowledgedBy,
      },
    },
  };
  store.alerts[index] = updated;
  await writeFabricChangeAlerts(store);
  return { alert: updated, newlyAcknowledged: true };
}

export async function markFabricChangeAlertAdminNotified(alertId: string): Promise<void> {
  const store = structuredClone(await readFabricChangeAlertsFreshAsync());
  const index = store.alerts.findIndex((alert) => alert.id === alertId);
  if (index < 0) return;

  store.alerts[index] = {
    ...store.alerts[index]!,
    admin_notified_at: new Date().toISOString(),
  };
  await writeFabricChangeAlerts(store);
}
