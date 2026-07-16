import {
  locateFabricReceipt,
  mutateFabricReceiptAnywhere,
  readFabricReceiptsArchive,
  readFabricReceiptsFreshAsync,
} from "@/lib/data/fabric-receipts";
import {
  isAllowedDefectPhotoContentType,
  writeDefectPhoto,
} from "@/lib/data/defect-photo-storage";
import { notifyIntegration } from "@/lib/integrations";
import type {
  FabricDefectFoundAt,
  FabricDefectListItem,
  FabricDefectPhoto,
  FabricDefectReport,
  FabricDefectStatus,
  FabricDefectSummary,
  FabricDefectType,
  FabricReceipt,
} from "@/lib/types/fabric-receipts";
import { FABRIC_DEFECT_TYPES } from "@/lib/types/fabric-receipts";

export type { FabricDefectListItem, FabricDefectSummary };

const DEFECT_TYPE_IDS = new Set(FABRIC_DEFECT_TYPES.map((item) => item.id));

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "photo.jpg";
}

function normalizeContentType(file: File): string {
  const raw = (file.type || "").toLowerCase().trim();
  if (raw === "image/jpg") return "image/jpeg";
  if (raw) return raw;
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  return "image/jpeg";
}

export function parseFoundAt(value: unknown): FabricDefectFoundAt | null {
  if (value === "receiving" || value === "cutting") return value;
  return null;
}

export function parseDefectType(value: unknown): FabricDefectType | string | undefined {
  if (value == null || value === "") return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  if (DEFECT_TYPE_IDS.has(text as FabricDefectType)) return text as FabricDefectType;
  return text.slice(0, 80);
}

function receiptReports(receipt: FabricReceipt): FabricDefectReport[] {
  return receipt.defect_reports ?? [];
}

function toListItem(receipt: FabricReceipt, defect: FabricDefectReport): FabricDefectListItem {
  return {
    receipt_id: receipt.id,
    sales_order_id: receipt.sales_order_id,
    sales_order_line_id: receipt.sales_order_line_id,
    so_number: receipt.so_number,
    client_name: receipt.client_name,
    client_code: receipt.client_code,
    fabric_number: receipt.fabric_number,
    garment_type: receipt.garment_type,
    receipt_status: receipt.status,
    defect,
    thumbnail_photo_id: defect.photos[0]?.id ?? null,
  };
}

export async function listAllFabricDefects(options?: {
  status?: FabricDefectStatus | "all";
}): Promise<{ items: FabricDefectListItem[]; summary: FabricDefectSummary }> {
  const statusFilter = options?.status ?? "all";
  const active = await readFabricReceiptsFreshAsync();
  const archive = readFabricReceiptsArchive();
  const receipts = [...active.receipts, ...archive.receipts];

  const items: FabricDefectListItem[] = [];
  const summary: FabricDefectSummary = {
    open: 0,
    acknowledged: 0,
    resolved: 0,
    found_at_receiving: 0,
    found_at_cutting: 0,
    task_team_misses: 0,
  };

  for (const receipt of receipts) {
    for (const defect of receiptReports(receipt)) {
      if (defect.status === "open") summary.open += 1;
      else if (defect.status === "acknowledged") summary.acknowledged += 1;
      else if (defect.status === "resolved") summary.resolved += 1;

      if (defect.found_at === "receiving") summary.found_at_receiving += 1;
      if (defect.found_at === "cutting") summary.found_at_cutting += 1;
      if (defect.task_team_miss) summary.task_team_misses += 1;

      if (statusFilter !== "all" && defect.status !== statusFilter) continue;
      items.push(toListItem(receipt, defect));
    }
  }

  items.sort((a, b) => b.defect.reported_at.localeCompare(a.defect.reported_at));
  return { items, summary };
}

export async function listOpenFabricDefects(): Promise<FabricDefectListItem[]> {
  const { items } = await listAllFabricDefects({ status: "open" });
  return items;
}

export type ReportFabricDefectInput = {
  receipt_id: string;
  note: string;
  found_at: FabricDefectFoundAt;
  defect_type?: FabricDefectType | string;
  reported_by: string;
  photos: File[];
  source?: "erp" | "api" | "zapier";
};

export type ReportFabricDefectResult = {
  receipt: FabricReceipt;
  defect: FabricDefectReport;
};

export async function reportFabricDefect(
  input: ReportFabricDefectInput
): Promise<ReportFabricDefectResult> {
  const note = input.note.trim();
  if (!note) {
    throw new Error("A note is required.");
  }
  if (!input.photos.length) {
    throw new Error("At least one photo is required.");
  }

  const located = locateFabricReceipt(input.receipt_id);
  if (!located) {
    throw new Error("Fabric receipt not found.");
  }

  const now = new Date().toISOString();
  const defectId = `fdr-${Date.now()}`;
  const photos: FabricDefectPhoto[] = [];

  for (let index = 0; index < input.photos.length; index++) {
    const file = input.photos[index]!;
    const contentType = normalizeContentType(file);
    if (!isAllowedDefectPhotoContentType(contentType)) {
      throw new Error("Photos must be JPEG, PNG, WebP, or HEIC.");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length === 0) {
      throw new Error("Photo file is empty.");
    }
    if (buffer.length > 20 * 1024 * 1024) {
      throw new Error("Each photo must be 20MB or smaller.");
    }
    const safeName = sanitizeFilename(file.name || `photo-${index + 1}.jpg`);
    const storedFilename = `${input.receipt_id}-${defectId}-${index}-${Date.now()}-${safeName}`;
    await writeDefectPhoto(storedFilename, buffer, contentType);
    photos.push({
      id: `fdp-${Date.now()}-${index}`,
      filename: file.name || safeName,
      stored_filename: storedFilename,
      content_type: contentType,
      size_bytes: buffer.length,
      uploaded_at: now,
    });
  }

  const defect: FabricDefectReport = {
    id: defectId,
    reported_at: now,
    reported_by: input.reported_by,
    note,
    defect_type: parseDefectType(input.defect_type),
    found_at: input.found_at,
    task_team_miss: input.found_at === "cutting",
    photos,
    status: "open",
  };

  const receipt = await mutateFabricReceiptAnywhere(input.receipt_id, (current) => {
    if (!current.defect_reports) current.defect_reports = [];
    current.defect_reports.unshift(defect);
    current.updated_at = now;
    return { ...current };
  });

  const source = input.source ?? "erp";
  await notifyIntegration(
    "fabric_receiving.defect_reported",
    {
      receipt_id: receipt.id,
      defect_id: defect.id,
      sales_order_id: receipt.sales_order_id,
      sales_order_line_id: receipt.sales_order_line_id,
      so_number: receipt.so_number,
      client_name: receipt.client_name,
      fabric_number: receipt.fabric_number,
      found_at: defect.found_at,
      task_team_miss: defect.task_team_miss,
      defect_type: defect.defect_type ?? null,
      note: defect.note,
      photo_count: defect.photos.length,
      reported_by: defect.reported_by,
      status: defect.status,
    },
    source
  );

  return { receipt, defect };
}

export async function updateFabricDefectStatus(
  receiptId: string,
  defectId: string,
  action: "acknowledge" | "resolve",
  actor: string,
  source: "erp" | "api" | "zapier" = "erp"
): Promise<{ receipt: FabricReceipt; defect: FabricDefectReport }> {
  const now = new Date().toISOString();

  const result = await mutateFabricReceiptAnywhere(receiptId, (receipt) => {
    const defect = receiptReports(receipt).find((item) => item.id === defectId);
    if (!defect) {
      throw new Error("Defect report not found.");
    }

    if (action === "acknowledge") {
      if (defect.status === "resolved") {
        throw new Error("Resolved defects cannot be acknowledged.");
      }
      if (defect.status === "acknowledged") {
        return { receipt: { ...receipt }, defect };
      }
      defect.status = "acknowledged";
      defect.acknowledged_at = now;
      defect.acknowledged_by = actor;
    } else {
      if (defect.status === "resolved") {
        return { receipt: { ...receipt }, defect };
      }
      defect.status = "resolved";
      defect.resolved_at = now;
      defect.resolved_by = actor;
      if (!defect.acknowledged_at) {
        defect.acknowledged_at = now;
        defect.acknowledged_by = actor;
      }
    }

    receipt.updated_at = now;
    return { receipt: { ...receipt }, defect: { ...defect } };
  });

  const event =
    action === "acknowledge"
      ? "fabric_receiving.defect_acknowledged"
      : "fabric_receiving.defect_resolved";

  await notifyIntegration(
    event,
    {
      receipt_id: result.receipt.id,
      defect_id: result.defect.id,
      sales_order_id: result.receipt.sales_order_id,
      so_number: result.receipt.so_number,
      found_at: result.defect.found_at,
      task_team_miss: result.defect.task_team_miss,
      status: result.defect.status,
      actor,
    },
    source
  );

  return result;
}

export function findDefectPhoto(
  receiptId: string,
  photoId: string
): { receipt: FabricReceipt; defect: FabricDefectReport; photo: FabricDefectPhoto } | null {
  const located = locateFabricReceipt(receiptId);
  if (!located) return null;
  for (const defect of receiptReports(located.receipt)) {
    const photo = defect.photos.find((item) => item.id === photoId);
    if (photo) {
      return { receipt: located.receipt, defect, photo };
    }
  }
  return null;
}

export function openDefectCount(receipt: FabricReceipt | null | undefined): number {
  if (!receipt?.defect_reports?.length) return 0;
  return receipt.defect_reports.filter((item) => item.status === "open").length;
}

export function hasAnyDefectReport(receipt: FabricReceipt | null | undefined): boolean {
  return Boolean(receipt?.defect_reports?.length);
}
