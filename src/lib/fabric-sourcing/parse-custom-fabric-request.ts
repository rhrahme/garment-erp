import type { CreateCustomFabricInput } from "@/lib/types/custom-fabrics";
import {
  pickPhotoFromFormData,
  storeCustomFabricImageFile,
  storeCustomFabricImageFromUrl,
} from "@/lib/fabric-sourcing/custom-fabric-image";

function formText(form: FormData, key: string): string | null {
  const value = form.get(key);
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formNumber(form: FormData, key: string): number | null {
  const raw = formText(form, key);
  if (raw == null) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/** Build create input from multipart form fields (photo handled separately). */
export function createInputFromFormData(form: FormData): CreateCustomFabricInput {
  return {
    description: formText(form, "description") ?? "",
    color: formText(form, "color"),
    composition: formText(form, "composition"),
    weight_gsm: formNumber(form, "weight_gsm"),
    width_cm: formNumber(form, "width_cm"),
    unit_price: formNumber(form, "unit_price"),
    currency: formText(form, "currency") as CreateCustomFabricInput["currency"],
    source_note: formText(form, "source_note"),
    supplier_name: formText(form, "supplier_name"),
    client_id: formText(form, "client_id"),
    client_name: formText(form, "client_name"),
    sales_order_id: formText(form, "sales_order_id"),
    created_by: formText(form, "created_by"),
  };
}

/**
 * Parse JSON or multipart create body and optionally store a swatch image.
 * Multipart: fields + photo|image|swatch file.
 * JSON: same fields + optional image_url (http/https) to download and store.
 */
export async function parseCreateCustomFabricRequest(
  request: Request,
  options: { uploadedBy: string | null; stripPrice?: boolean } = { uploadedBy: null }
): Promise<{ ok: true; data: CreateCustomFabricInput } | { ok: false; error: string; status: number }> {
  const contentType = request.headers.get("content-type") ?? "";
  let input: CreateCustomFabricInput;
  let photo: File | null = null;
  let imageUrl: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    input = createInputFromFormData(form);
    photo = pickPhotoFromFormData(form);
    imageUrl = formText(form, "image_url");
  } else {
    const body = (await request.json()) as CreateCustomFabricInput & { image_url?: string | null };
    input = body;
    imageUrl = typeof body.image_url === "string" ? body.image_url.trim() || null : null;
  }

  if (options.stripPrice) {
    input = { ...input, unit_price: null, currency: null };
  }

  try {
    if (photo) {
      input = {
        ...input,
        image: await storeCustomFabricImageFile(photo, options.uploadedBy),
      };
    } else if (imageUrl) {
      input = {
        ...input,
        image: await storeCustomFabricImageFromUrl(imageUrl, options.uploadedBy),
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to store image.";
    return { ok: false, error: message, status: 400 };
  }

  return { ok: true, data: { ...input, created_by: input.created_by ?? options.uploadedBy } };
}
