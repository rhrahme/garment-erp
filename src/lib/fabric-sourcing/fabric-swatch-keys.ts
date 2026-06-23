import { resolveFabricSupplierId } from "@/lib/fabric-sourcing/supplier-aliases";
import {
  isLoroPianaStyleSupplier,
  normalizeLoroPianaFabricNumber,
} from "@/lib/fabric-sourcing/loro-piana-styles";
import { CACCIOPPOLI_SUPPLIER_ID } from "@/lib/integrations/caccioppoli/config";
import { DRAPERS_SUPPLIER_ID } from "@/lib/integrations/drapers/config";

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
    return drapersMap.get(trimmed);
  }

  if (isCaccioppoliSwatchSupplier(supplierId)) {
    return caccioppoliMap.get(trimmed);
  }

  if (isLoroPianaSwatchSupplier(supplierId)) {
    const normalized = normalizeLoroPianaFabricNumber(trimmed);
    return loroPianaMap.get(normalized) ?? loroPianaMap.get(trimmed);
  }

  return undefined;
}
