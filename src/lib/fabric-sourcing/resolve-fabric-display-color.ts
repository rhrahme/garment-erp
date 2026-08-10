import { resolveLoroPianaDisplayColor } from "@/lib/fabric-sourcing/loro-piana-swatch-colors";
import { isLoroPianaStyleSupplier } from "@/lib/fabric-sourcing/loro-piana-styles";
import { resolveFabricSupplierId } from "@/lib/fabric-sourcing/supplier-aliases";

/**
 * Color label for UI: explicit line/catalog color, else LP/Solbiati swatch sample.
 */
export function resolveFabricDisplayColor(input: {
  supplier_id?: string | null;
  fabric_number?: string | null;
  color?: string | null;
}): string | null {
  const explicit = input.color?.trim() || null;
  if (explicit) return explicit;
  const supplierId = resolveFabricSupplierId(input.supplier_id ?? "").trim().toLowerCase();
  if (!isLoroPianaStyleSupplier(supplierId)) return null;
  return resolveLoroPianaDisplayColor(input.fabric_number, null);
}
