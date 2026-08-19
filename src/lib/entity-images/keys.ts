import type { EntityImageKind, EntityImageRef } from "@/lib/types/entity-images";

export function normalizeEntityPart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80);
}

export function fabricEntityKey(supplierId: string, fabricNumber: string): string | null {
  const supplier = normalizeEntityPart(supplierId);
  const fabric = normalizeEntityPart(fabricNumber);
  if (!supplier || !fabric) return null;
  return `fabric:${supplier}::${fabric}`;
}

export function garmentEntityKey(garmentType: string): string | null {
  const garment = normalizeEntityPart(garmentType);
  if (!garment) return null;
  return `garment:${garment}`;
}

export function soLineEntityKey(salesOrderLineId: string): string | null {
  const lineId = salesOrderLineId.trim();
  if (!lineId || !/^[a-zA-Z0-9._-]+$/.test(lineId)) return null;
  return `so_line:${lineId}`;
}

export function parseEntityKey(key: string): { kind: EntityImageKind; key: string } | null {
  const trimmed = key.trim();
  if (trimmed.startsWith("fabric:")) {
    const rest = trimmed.slice("fabric:".length);
    const split = rest.indexOf("::");
    if (split <= 0 || split === rest.length - 2) return null;
    const supplier = rest.slice(0, split);
    const fabric = rest.slice(split + 2);
    const built = fabricEntityKey(supplier, fabric);
    return built ? { kind: "fabric", key: built } : null;
  }
  if (trimmed.startsWith("garment:")) {
    const built = garmentEntityKey(trimmed.slice("garment:".length));
    return built ? { kind: "garment", key: built } : null;
  }
  if (trimmed.startsWith("so_line:")) {
    const built = soLineEntityKey(trimmed.slice("so_line:".length));
    return built ? { kind: "so_line", key: built } : null;
  }
  return null;
}

export function isValidEntityKey(key: string): boolean {
  return parseEntityKey(key) !== null;
}

export function albumFilenamePrefix(albumKey: string): string {
  return albumKey.replace(/[^a-z0-9-]/gi, "_").slice(0, 80);
}

export function entityRefsFromContext(input: {
  supplierId?: string | null;
  fabricNumber?: string | null;
  garmentType?: string | null;
  salesOrderLineId?: string | null;
}): EntityImageRef[] {
  const refs: EntityImageRef[] = [];
  const fabricKey = fabricEntityKey(input.supplierId ?? "", input.fabricNumber ?? "");
  if (fabricKey && input.fabricNumber?.trim()) {
    refs.push({
      key: fabricKey,
      kind: "fabric",
      label: `Fabric ${input.fabricNumber.trim()}`,
    });
  }
  const garmentKey = garmentEntityKey(input.garmentType ?? "");
  if (garmentKey && input.garmentType?.trim()) {
    refs.push({
      key: garmentKey,
      kind: "garment",
      label: input.garmentType.trim(),
    });
  }
  const lineKey = soLineEntityKey(input.salesOrderLineId ?? "");
  if (lineKey) {
    refs.push({
      key: lineKey,
      kind: "so_line",
      label: "This article",
    });
  }
  return refs;
}

export function resolveEntityKeyFromParts(input: {
  key?: string | null;
  kind?: string | null;
  supplier_id?: string | null;
  fabric_number?: string | null;
  garment_type?: string | null;
  sales_order_line_id?: string | null;
}): EntityImageRef | null {
  if (input.key) {
    const parsed = parseEntityKey(input.key);
    if (!parsed) return null;
    return {
      key: parsed.key,
      kind: parsed.kind,
      label:
        parsed.kind === "fabric"
          ? `Fabric ${String(input.fabric_number ?? "").trim() || parsed.key}`
          : parsed.kind === "garment"
            ? String(input.garment_type ?? "").trim() || "Garment"
            : "This article",
    };
  }

  const kind = String(input.kind ?? "").trim();
  if (kind === "fabric" || (!kind && input.supplier_id && input.fabric_number && !input.garment_type && !input.sales_order_line_id)) {
    const refs = entityRefsFromContext({
      supplierId: input.supplier_id,
      fabricNumber: input.fabric_number,
    });
    return refs[0] ?? null;
  }
  if (kind === "garment" || (!kind && input.garment_type && !input.supplier_id && !input.sales_order_line_id)) {
    const refs = entityRefsFromContext({ garmentType: input.garment_type });
    return refs[0] ?? null;
  }
  if (kind === "so_line") {
    const refs = entityRefsFromContext({ salesOrderLineId: input.sales_order_line_id });
    return refs[0] ?? null;
  }

  const refs = entityRefsFromContext({
    supplierId: input.supplier_id,
    fabricNumber: input.fabric_number,
    garmentType: input.garment_type,
    salesOrderLineId: input.sales_order_line_id,
  });
  return refs[0] ?? null;
}
