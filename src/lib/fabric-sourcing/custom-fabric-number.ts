import type { PriceCurrency } from "../currency/config.ts";
import type { CreateCustomFabricInput } from "../types/custom-fabrics.ts";

/** Allocate next CF-{YYYY}-{####} from existing custom fabric numbers. */
export function generateCustomFabricNumber(
  fabrics: Array<{ fabric_number: string }>,
  now: Date = new Date()
): string {
  const year = now.getFullYear();
  const prefix = `CF-${year}-`;
  let max = 0;
  for (const fabric of fabrics) {
    if (!fabric.fabric_number.startsWith(prefix)) continue;
    const seq = Number.parseInt(fabric.fabric_number.slice(prefix.length), 10);
    if (!Number.isNaN(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

function normalizeText(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(n)) return null;
  return n;
}

function normalizeCurrency(value: unknown): PriceCurrency | null {
  const raw = String(value ?? "").trim().toUpperCase();
  if (raw === "USD" || raw === "EUR" || raw === "AED") return raw;
  return null;
}

export function validateCreateCustomFabricInput(
  input: CreateCustomFabricInput
): { ok: true; data: CreateCustomFabricInput } | { ok: false; error: string } {
  const description = normalizeText(input.description);
  if (!description) {
    return { ok: false, error: "description is required." };
  }

  const weight_gsm = normalizeOptionalNumber(input.weight_gsm);
  const width_cm = normalizeOptionalNumber(input.width_cm);
  const unit_price = normalizeOptionalNumber(input.unit_price);
  if (input.weight_gsm != null && weight_gsm == null) {
    return { ok: false, error: "weight_gsm must be a number." };
  }
  if (input.width_cm != null && width_cm == null) {
    return { ok: false, error: "width_cm must be a number." };
  }
  if (input.unit_price != null && unit_price == null) {
    return { ok: false, error: "unit_price must be a number." };
  }

  const currency = normalizeCurrency(input.currency);
  if (input.currency != null && String(input.currency).trim() !== "" && !currency) {
    return { ok: false, error: "currency must be USD, EUR, or AED." };
  }

  return {
    ok: true,
    data: {
      description,
      color: normalizeText(input.color),
      composition: normalizeText(input.composition),
      weight_gsm,
      width_cm,
      unit_price,
      currency: currency ?? (unit_price != null ? "EUR" : null),
      source_note: normalizeText(input.source_note),
      client_id: normalizeText(input.client_id),
      client_name: normalizeText(input.client_name),
      sales_order_id: normalizeText(input.sales_order_id),
      created_by: normalizeText(input.created_by),
    },
  };
}

export function generateCustomFabricId(fabricNumber: string): string {
  return fabricNumber.trim().toLowerCase();
}
