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

export type ClientPhotoFabricAssignment = {
  fabric_line_id: string | null;
  article_number?: string | null;
  sales_order_id?: string | null;
  so_number?: string | null;
  client_pattern_id?: string | null;
};

/** Pattern links a wearing photo to a fabric line / article (or clears the link). */
export async function assignSalesClientPhotoToFabric(
  photoId: string,
  assignment: ClientPhotoFabricAssignment,
  actor: string | null,
  source: "erp" | "api" = "erp"
): Promise<{ client_id: string; photo: ClientPhoto } | null> {
  const result = await mutateSalesWorkspace((store) => {
    const row = store.client_details.find((item) =>
      item.photos.some((photo) => photo.id === photoId)
    );
    if (!row) return null;
    const photo = row.photos.find((item) => item.id === photoId);
    if (!photo) return null;
    const now = new Date().toISOString();
    const lineId = assignment.fabric_line_id?.trim() || null;
    if (!lineId) {
      photo.assigned_fabric_line_id = null;
      photo.assigned_article_number = null;
      photo.assigned_sales_order_id = null;
      photo.assigned_so_number = null;
      photo.assigned_client_pattern_id = null;
      photo.assigned_at = null;
      photo.assigned_by = null;
    } else {
      photo.assigned_fabric_line_id = lineId;
      photo.assigned_article_number = assignment.article_number?.trim() || null;
      photo.assigned_sales_order_id = assignment.sales_order_id?.trim() || null;
      photo.assigned_so_number = assignment.so_number?.trim() || null;
      photo.assigned_client_pattern_id = assignment.client_pattern_id?.trim() || null;
      photo.assigned_at = now;
      photo.assigned_by = actor;
    }
    row.updated_at = now;
    row.updated_by = actor;
    return { client_id: row.client_id, photo: structuredClone(photo), cleared: !lineId };
  });
  if (result) {
    await notifyIntegration(
      result.cleared ? "sales_client_photo.unassigned" : "sales_client_photo.assigned",
      {
        client_id: result.client_id,
        photo_id: result.photo.id,
        filename: result.photo.filename,
        fabric_line_id: result.photo.assigned_fabric_line_id ?? null,
        article_number: result.photo.assigned_article_number ?? null,
        sales_order_id: result.photo.assigned_sales_order_id ?? null,
        so_number: result.photo.assigned_so_number ?? null,
        client_pattern_id: result.photo.assigned_client_pattern_id ?? null,
        assigned_by: actor,
      },
      source
    );
  }
  return result ? { client_id: result.client_id, photo: result.photo } : null;
}

export async function removeSalesClientPhoto(
  photoId: string,
  actor: string | null,
  source: "erp" | "api" = "erp"
): Promise<{ client_id: string; photo: ClientPhoto } | null> {
  const removed = await mutateSalesWorkspace((store) => {
    const row = store.client_details.find((item) =>
      item.photos.some((photo) => photo.id === photoId)
    );
    if (!row) return null;
    const photo = row.photos.find((item) => item.id === photoId);
    if (!photo) return null;
    row.photos = row.photos.filter((item) => item.id !== photoId);
    row.updated_at = new Date().toISOString();
    row.updated_by = actor;
    return { client_id: row.client_id, photo: structuredClone(photo) };
  });
  if (removed) {
    await notifyIntegration(
      "sales_client_photo.deleted",
      {
        client_id: removed.client_id,
        photo_id: removed.photo.id,
        filename: removed.photo.filename,
        deleted_by: actor,
      },
      source
    );
  }
  return removed;
}

export async function requestSalesClientPhotoDelete(
  photoId: string,
  actor: string | null
): Promise<{ client_id: string; photo: ClientPhoto } | null> {
  return mutateSalesWorkspace((store) => {
    const row = store.client_details.find((item) =>
      item.photos.some((photo) => photo.id === photoId)
    );
    if (!row) return null;
    const photo = row.photos.find((item) => item.id === photoId);
    if (!photo) return null;
    const now = new Date().toISOString();
    photo.delete_requested_at = now;
    photo.delete_requested_by = actor;
    row.updated_at = now;
    row.updated_by = actor;
    return { client_id: row.client_id, photo: structuredClone(photo) };
  });
}

/** Clears a pending delete request (requester cancel or admin Keep). */
export async function clearSalesClientPhotoDeleteRequest(
  photoId: string,
  actor: string | null
): Promise<{ client_id: string; photo: ClientPhoto } | null> {
  return mutateSalesWorkspace((store) => {
    const row = store.client_details.find((item) =>
      item.photos.some((photo) => photo.id === photoId)
    );
    if (!row) return null;
    const photo = row.photos.find((item) => item.id === photoId);
    if (!photo) return null;
    if (!photo.delete_requested_at) return { client_id: row.client_id, photo: structuredClone(photo) };
    photo.delete_requested_at = null;
    photo.delete_requested_by = null;
    row.updated_at = new Date().toISOString();
    row.updated_by = actor;
    return { client_id: row.client_id, photo: structuredClone(photo) };
  });
}

/**
 * Replace file bytes for an existing photo id (same slot). Returns the previous
 * stored filename so the caller can delete the old blob.
 */
export async function replaceSalesClientPhoto(
  photoId: string,
  next: Omit<ClientPhoto, "id" | "delete_requested_at" | "delete_requested_by"> & {
    id?: string;
  },
  actor: string | null,
  source: "erp" | "api" = "erp"
): Promise<{ client_id: string; photo: ClientPhoto; previous_stored_filename: string } | null> {
  const result = await mutateSalesWorkspace((store) => {
    const row = store.client_details.find((item) =>
      item.photos.some((photo) => photo.id === photoId)
    );
    if (!row) return null;
    const photo = row.photos.find((item) => item.id === photoId);
    if (!photo) return null;
    const previous_stored_filename = photo.stored_filename;
    const now = new Date().toISOString();
    photo.filename = next.filename;
    photo.stored_filename = next.stored_filename;
    photo.content_type = next.content_type;
    photo.size_bytes = next.size_bytes;
    photo.uploaded_at = next.uploaded_at || now;
    photo.uploaded_by = next.uploaded_by ?? actor;
    photo.delete_requested_at = null;
    photo.delete_requested_by = null;
    row.updated_at = now;
    row.updated_by = actor;
    return {
      client_id: row.client_id,
      photo: structuredClone(photo),
      previous_stored_filename,
    };
  });
  if (result) {
    await notifyIntegration(
      "sales_client_photo.uploaded",
      {
        client_id: result.client_id,
        photo_id: result.photo.id,
        filename: result.photo.filename,
        replaced: true,
      },
      source
    );
  }
  return result;
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
