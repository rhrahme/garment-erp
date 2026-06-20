"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useFabricSwatchResolver, type FabricSwatchResolver } from "@/hooks/useFabricSwatchResolver";
import type { FabricSwatchKey } from "@/lib/fabric-sourcing/fabric-swatch-keys";

const FabricSwatchContext = createContext<FabricSwatchResolver | null>(null);

export function FabricSwatchProvider({
  fabrics,
  children,
}: {
  fabrics: FabricSwatchKey[];
  children: ReactNode;
}) {
  const getSwatch = useFabricSwatchResolver(fabrics);
  return <FabricSwatchContext.Provider value={getSwatch}>{children}</FabricSwatchContext.Provider>;
}

export function useFabricSwatch(): FabricSwatchResolver | null {
  return useContext(FabricSwatchContext);
}
