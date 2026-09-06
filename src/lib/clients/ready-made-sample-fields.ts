import { isGarmentStitchType } from "@/lib/sales-orders/garment-types";

export const CLIENT_SAMPLE_PURPOSES = ["copy", "fix"] as const;

export type ClientSamplePurpose = (typeof CLIENT_SAMPLE_PURPOSES)[number];

export const CLIENT_SAMPLE_PURPOSE_LABELS: Record<ClientSamplePurpose, string> = {
  copy: "Copy",
  fix: "Fix",
};

export function isClientSamplePurpose(value: string): value is ClientSamplePurpose {
  return (CLIENT_SAMPLE_PURPOSES as readonly string[]).includes(value);
}

export function normalizeSampleProductType(
  value: unknown,
  options?: { allowLegacy?: boolean }
): { ok: true; value: string } | { ok: false; error: string } {
  const text = String(value ?? "").trim();
  if (!text) {
    return { ok: false, error: "Pick the garment type (Trouser, Jacket, Suit...)." };
  }
  if (isGarmentStitchType(text)) return { ok: true, value: text };
  if (options?.allowLegacy) return { ok: true, value: text };
  return { ok: false, error: "Pick a garment type from the list." };
}

export function normalizeSamplePurpose(
  value: unknown,
  options?: { optional?: boolean }
): { ok: true; value: ClientSamplePurpose | null } | { ok: false; error: string } {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) {
    if (options?.optional) return { ok: true, value: null };
    return { ok: false, error: "Say if we are copying the garment or fixing it." };
  }
  if (isClientSamplePurpose(text)) return { ok: true, value: text };
  return { ok: false, error: "Purpose must be Copy or Fix." };
}

export function samplePurposeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = value.trim().toLowerCase();
  if (isClientSamplePurpose(key)) return CLIENT_SAMPLE_PURPOSE_LABELS[key];
  return null;
}

/** ERP create: at least one receipt photo must be selected before save. */
export function validateSamplePhotoCount(
  value: unknown,
  options?: { required?: boolean }
): { ok: true; count: number } | { ok: false; error: string } {
  const parsed = Number(value);
  const count = Number.isFinite(parsed) ? Math.floor(parsed) : 0;
  if (options?.required !== false && count < 1) {
    return {
      ok: false,
      error: "Add at least one photo. Photos confirm we received the garment.",
    };
  }
  return { ok: true, count: Math.max(0, count) };
}
