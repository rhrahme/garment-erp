import type { SupplierFabric } from "@/lib/types/fabric-sourcing";

type FabricLabelFields = Pick<SupplierFabric, "name" | "description" | "finish">;

function descriptionParts(description: string | null | undefined): string[] {
  if (!description?.trim()) return [];
  return description
    .split(/\s+—\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Collection / bunch name (Drapers price list Pattern — Blazon, Arrival, ZENIT). */
export function formatFabricPatternLabel(fabric: FabricLabelFields): string | null {
  const parts = descriptionParts(fabric.description);
  if (parts.length >= 2) return parts[0];
  if (fabric.description?.trim()) return fabric.description.trim();

  const namePart = fabric.name?.split(/\s+—\s+/)[0]?.trim();
  return namePart || null;
}

/** Weave / category text (Drapers Testo — CLASSICO, SEMI CLASSICO, UNITO). */
export function formatFabricTextLabel(fabric: FabricLabelFields): string | null {
  if (fabric.finish?.trim()) return fabric.finish.trim();

  const parts = descriptionParts(fabric.description);
  if (parts.length >= 2) {
    const middle = parts[1].replace(/\s*\([^)]+\)\s*$/, "").trim();
    return middle || parts[1];
  }

  return null;
}
