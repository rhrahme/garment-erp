export const GARMENT_HANDOVER_TO = ["factory_driver", "client_driver"] as const;

export type GarmentHandoverTo = (typeof GARMENT_HANDOVER_TO)[number];

export const GARMENT_HANDOVER_LABELS: Record<GarmentHandoverTo, string> = {
  factory_driver: "Handed to factory driver",
  client_driver: "Handed to client driver",
};

export const GARMENT_HANDOVER_HINTS: Record<GarmentHandoverTo, string> = {
  factory_driver:
    "He will later have an account and send a photo when he delivers to the client. You can also add a photo now.",
  client_driver:
    "Handed to the client's driver at the factory. Add a proof photo if you have one.",
};

/** Staff photo when we handed the garment over. Delivery-to-client proof is later. */
export interface HandoverProofImage {
  id: string;
  filename: string;
  stored_filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
  uploaded_by: string | null;
}

export const HANDOVER_PROOF_TARGETS = ["work_order", "sample"] as const;

export type HandoverProofTarget = (typeof HANDOVER_PROOF_TARGETS)[number];

export function isGarmentHandoverTo(value: string): value is GarmentHandoverTo {
  return (GARMENT_HANDOVER_TO as readonly string[]).includes(value);
}

export function isHandoverProofTarget(value: string): value is HandoverProofTarget {
  return (HANDOVER_PROOF_TARGETS as readonly string[]).includes(value);
}

export function normalizeGarmentHandoverTo(
  value: unknown
): { ok: true; value: GarmentHandoverTo } | { ok: false; error: string } {
  const text = String(value ?? "").trim();
  if (isGarmentHandoverTo(text)) return { ok: true, value: text };
  return {
    ok: false,
    error: "Say who took the garment: factory driver or client driver.",
  };
}

export function garmentHandoverLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = value.trim();
  if (isGarmentHandoverTo(key)) return GARMENT_HANDOVER_LABELS[key];
  return null;
}

export function garmentHandoverHint(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = value.trim();
  if (isGarmentHandoverTo(key)) return GARMENT_HANDOVER_HINTS[key];
  return null;
}

export function handoverProofSrc(
  target: HandoverProofTarget,
  targetId: string,
  image: Pick<HandoverProofImage, "id" | "uploaded_at">
): string {
  return `/api/handover-proof/${target}/${encodeURIComponent(targetId)}/${encodeURIComponent(image.id)}?v=${encodeURIComponent(image.uploaded_at)}`;
}

export function handoverProofNotifyPayload(
  image: HandoverProofImage | null | undefined
): { id: string; filename: string; uploaded_at: string; uploaded_by: string | null } | null {
  if (!image) return null;
  return {
    id: image.id,
    filename: image.filename,
    uploaded_at: image.uploaded_at,
    uploaded_by: image.uploaded_by,
  };
}
