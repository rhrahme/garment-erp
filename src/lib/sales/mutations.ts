import { mutateSalesWorkspace } from "@/lib/data/sales-workspace";
import { notifyIntegration } from "@/lib/integrations";
import { SALES_MILESTONES } from "@/lib/sales/milestones";
import type {
  ClientFabricSelection,
  ClientPhoto,
  SalesClientDetails,
  SalesFitting,
  SalesFittingStatus,
  SalesMilestone,
} from "@/lib/types/sales-workspace";

function cleanMeasurements(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, measurement]) => [key.trim(), String(measurement ?? "").trim()])
      .filter(([key, measurement]) => key && measurement)
      .slice(0, 100)
  );
}

export async function updateSalesClientDetails(
  clientId: string,
  input: {
    measurements?: unknown;
    fabric_selection?: Partial<ClientFabricSelection>;
  },
  actor: string | null,
  source: "erp" | "api" = "erp"
): Promise<SalesClientDetails> {
  const details = await mutateSalesWorkspace((store) => {
    const now = new Date().toISOString();
    let row = store.client_details.find((item) => item.client_id === clientId);
    if (!row) {
      row = {
        client_id: clientId,
        measurements: {},
        photos: [],
        fabric_selections: [],
        updated_at: now,
        updated_by: actor,
      };
      store.client_details.push(row);
    }
    if (input.measurements !== undefined) row.measurements = cleanMeasurements(input.measurements);
    if (input.fabric_selection) {
      const selection = input.fabric_selection;
      const supplierId = String(selection.supplier_id ?? "").trim();
      const fabricNumber = String(selection.fabric_number ?? "").trim();
      if (!supplierId || !fabricNumber) throw new Error("Supplier and fabric number are required.");
      row.fabric_selections.push({
        id: `selection-${Date.now()}`,
        sales_order_id: selection.sales_order_id?.trim() || null,
        supplier_id: supplierId,
        supplier_name: String(selection.supplier_name ?? supplierId).trim(),
        fabric_number: fabricNumber,
        color: selection.color?.trim() || null,
        composition: selection.composition?.trim() || null,
        meters:
          selection.meters != null && Number.isFinite(Number(selection.meters))
            ? Number(selection.meters)
            : null,
        selected_at: now,
      });
    }
    row.updated_at = now;
    row.updated_by = actor;
    return structuredClone(row);
  });

  await notifyIntegration(
    "sales_client_details.updated",
    { client_id: clientId, updated_by: actor },
    source
  );
  return details;
}

export async function attachSalesClientPhoto(
  clientId: string,
  photo: ClientPhoto,
  source: "erp" | "api" = "erp"
): Promise<ClientPhoto> {
  await mutateSalesWorkspace((store) => {
    const now = new Date().toISOString();
    let row = store.client_details.find((item) => item.client_id === clientId);
    if (!row) {
      row = {
        client_id: clientId,
        measurements: {},
        photos: [],
        fabric_selections: [],
        updated_at: now,
        updated_by: photo.uploaded_by,
      };
      store.client_details.push(row);
    }
    row.photos.push(photo);
    row.updated_at = now;
    row.updated_by = photo.uploaded_by;
  });
  await notifyIntegration(
    "sales_client_photo.uploaded",
    { client_id: clientId, photo_id: photo.id, filename: photo.filename },
    source
  );
  return photo;
}

export async function createSalesFitting(
  salesOrderId: string,
  clientId: string,
  scheduledAt: string,
  notes: string | null,
  actor: string | null,
  source: "erp" | "api" = "erp"
): Promise<SalesFitting> {
  const fitting = await mutateSalesWorkspace((store) => {
    const now = new Date().toISOString();
    const sequence =
      Math.max(
        0,
        ...store.fittings
          .filter((item) => item.sales_order_id === salesOrderId)
          .map((item) => item.sequence_number)
      ) + 1;
    const row: SalesFitting = {
      id: `fitting-${Date.now()}-${sequence}`,
      sales_order_id: salesOrderId,
      client_id: clientId,
      sequence_number: sequence,
      scheduled_at: scheduledAt,
      notes,
      status: "scheduled",
      created_at: now,
      updated_at: now,
      created_by: actor,
    };
    store.fittings.push(row);
    return row;
  });
  await notifyIntegration("sales_fitting.created", { ...fitting }, source);
  return fitting;
}

export async function updateSalesFitting(
  fittingId: string,
  patch: { scheduled_at?: string; notes?: string | null; status?: SalesFittingStatus },
  actor: string | null,
  source: "erp" | "api" = "erp"
): Promise<SalesFitting | null> {
  const fitting = await mutateSalesWorkspace((store) => {
    const row = store.fittings.find((item) => item.id === fittingId);
    if (!row) return null;
    if (patch.scheduled_at) row.scheduled_at = patch.scheduled_at;
    if (patch.notes !== undefined) row.notes = patch.notes;
    if (patch.status) row.status = patch.status;
    row.updated_at = new Date().toISOString();
    return structuredClone(row);
  });
  if (fitting) {
    await notifyIntegration(
      "sales_fitting.updated",
      { ...fitting, updated_by: actor },
      source
    );
  }
  return fitting;
}

export async function updateSalesMilestone(
  salesOrderId: string,
  milestone: SalesMilestone,
  actor: string | null,
  acknowledge: boolean,
  source: "erp" | "api" = "erp"
) {
  if (!SALES_MILESTONES.includes(milestone)) throw new Error("Invalid milestone.");
  const row = await mutateSalesWorkspace((store) => {
    const now = new Date().toISOString();
    const existing = store.milestone_overrides.find(
      (item) => item.sales_order_id === salesOrderId
    );
    if (existing) {
      existing.milestone = milestone;
      existing.updated_at = now;
      existing.updated_by = actor;
      if (acknowledge) {
        existing.alert_acknowledged_at = now;
        existing.alert_acknowledged_milestone = milestone;
      } else if (existing.alert_acknowledged_milestone !== milestone) {
        existing.alert_acknowledged_at = null;
        existing.alert_acknowledged_milestone = null;
      }
      return structuredClone(existing);
    }
    const created = {
      sales_order_id: salesOrderId,
      milestone,
      updated_at: now,
      updated_by: actor,
      alert_acknowledged_at: acknowledge ? now : null,
      alert_acknowledged_milestone: acknowledge ? milestone : null,
    };
    store.milestone_overrides.push(created);
    return created;
  });
  await notifyIntegration("sales_order.milestone_updated", { ...row }, source);
  return row;
}
