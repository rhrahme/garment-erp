import { caccioppoliSwatchImageUrl } from "@/lib/fabric-sourcing/caccioppoli-swatch-url";
import { loroPianaSwatchImageUrl } from "@/lib/fabric-sourcing/loro-piana-swatch-url";
import { resolveFabricSupplierId } from "@/lib/fabric-sourcing/supplier-aliases";
import {
  isLoroPianaStyleSupplier,
  normalizeLoroPianaFabricNumber,
} from "@/lib/fabric-sourcing/loro-piana-styles";
import { CACCIOPPOLI_SUPPLIER_ID } from "@/lib/integrations/caccioppoli/config";
import { DRAPERS_SUPPLIER_ID } from "@/lib/integrations/drapers/config";
import { getDrapersUiSwatchUrls } from "@/lib/integrations/drapers/drapers-catalog-swatches";

export type FabricSwatchKey = {
  supplier_id: string;
  fabric_number: string;
};

export type FabricSwatchUrls = {
  square: string;
  zoom: string;
};

export function isDrapersSwatchSupplier(supplierId: string): boolean {
  return resolveFabricSupplierId(supplierId) === DRAPERS_SUPPLIER_ID;
}

export function isCaccioppoliSwatchSupplier(supplierId: string): boolean {
  return resolveFabricSupplierId(supplierId) === CACCIOPPOLI_SUPPLIER_ID;
}

export function isLoroPianaSwatchSupplier(supplierId: string): boolean {
  return isLoroPianaStyleSupplier(supplierId);
}

/** Deterministic proxy URL — safe to set before the batch lookup returns. */
export function provisionalCaccioppoliSwatchUrls(fabricNumber: string): FabricSwatchUrls {
  const url = caccioppoliSwatchImageUrl(fabricNumber);
  return { square: url, zoom: url };
}

/** Deterministic proxy URL — safe to set before the batch lookup returns. */
export function provisionalLoroPianaSwatchUrls(fabricNumber: string): FabricSwatchUrls {
  const url = loroPianaSwatchImageUrl(fabricNumber);
  return { square: url, zoom: url };
}

export function collectFabricSwatchKeys(fabrics: FabricSwatchKey[]): {
  drapersNumbers: string[];
  caccioppoliNumbers: string[];
  loroPianaNumbers: string[];
} {
  const drapers = new Set<string>();
  const caccioppoli = new Set<string>();
  const loroPiana = new Set<string>();

  for (const { supplier_id, fabric_number } of fabrics) {
    const number = fabric_number.trim();
    if (!number) continue;

    if (isDrapersSwatchSupplier(supplier_id)) {
      drapers.add(number);
    }
    if (isCaccioppoliSwatchSupplier(supplier_id)) {
      caccioppoli.add(number);
    }
    if (isLoroPianaSwatchSupplier(supplier_id)) {
      loroPiana.add(normalizeLoroPianaFabricNumber(number));
      loroPiana.add(number);
    }
  }

  return {
    drapersNumbers: [...drapers],
    caccioppoliNumbers: [...caccioppoli],
    loroPianaNumbers: [...loroPiana],
  };
}

export function resolveFabricSwatchUrls(
  supplierId: string,
  fabricNumber: string,
  drapersMap: Map<string, FabricSwatchUrls>,
  caccioppoliMap: Map<string, FabricSwatchUrls>,
  loroPianaMap: Map<string, FabricSwatchUrls>
): FabricSwatchUrls | undefined {
  const trimmed = fabricNumber.trim();
  if (!trimmed) return undefined;

  if (isDrapersSwatchSupplier(supplierId)) {
    return drapersMap.get(trimmed) ?? getDrapersUiSwatchUrls(trimmed);
  }

  if (isCaccioppoliSwatchSupplier(supplierId)) {
    // Always return the proxy URL immediately so print/preview can start loading
    // without waiting for the batch lookup (and even if the manifest is empty).
    return caccioppoliMap.get(trimmed) ?? provisionalCaccioppoliSwatchUrls(trimmed);
  }

  if (isLoroPianaSwatchSupplier(supplierId)) {
    const normalized = normalizeLoroPianaFabricNumber(trimmed);
    return (
      loroPianaMap.get(normalized) ??
      loroPianaMap.get(trimmed) ??
      provisionalLoroPianaSwatchUrls(normalized)
    );
  }

  return undefined;
}
