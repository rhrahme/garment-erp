"use client";

import { useMemo } from "react";
import { useCaccioppoliSwatchMap } from "@/hooks/useCaccioppoliSwatchMap";
import { useDrapersSwatchMap } from "@/hooks/useDrapersSwatchMap";
import { useLoroPianaSwatchMap } from "@/hooks/useLoroPianaSwatchMap";
import {
  collectFabricSwatchKeys,
  resolveFabricSwatchUrls,
  type FabricSwatchKey,
  type FabricSwatchUrls,
} from "@/lib/fabric-sourcing/fabric-swatch-keys";

export type FabricSwatchResolver = (supplierId: string, fabricNumber: string) => FabricSwatchUrls | undefined;

export function useFabricSwatchResolver(fabrics: FabricSwatchKey[]): FabricSwatchResolver {
  const { drapersNumbers, caccioppoliNumbers, loroPianaNumbers } = useMemo(
    () => collectFabricSwatchKeys(fabrics),
    [fabrics]
  );

  const drapersMap = useDrapersSwatchMap(drapersNumbers);
  const caccioppoliMap = useCaccioppoliSwatchMap(caccioppoliNumbers);
  const loroPianaMap = useLoroPianaSwatchMap(loroPianaNumbers);

  return useMemo(
    () => (supplierId: string, fabricNumber: string) =>
      resolveFabricSwatchUrls(supplierId, fabricNumber, drapersMap, caccioppoliMap, loroPianaMap),
    [drapersMap, caccioppoliMap, loroPianaMap]
  );
}
