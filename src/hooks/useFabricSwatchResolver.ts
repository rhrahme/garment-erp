"use client";

import { useMemo } from "react";
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
  const { drapersNumbers, loroPianaNumbers } = useMemo(
    () => collectFabricSwatchKeys(fabrics),
    [fabrics]
  );

  const drapersMap = useDrapersSwatchMap(drapersNumbers);
  const loroPianaMap = useLoroPianaSwatchMap(loroPianaNumbers);

  return useMemo(
    () => (supplierId: string, fabricNumber: string) =>
      resolveFabricSwatchUrls(supplierId, fabricNumber, drapersMap, loroPianaMap),
    [drapersMap, loroPianaMap]
  );
}
