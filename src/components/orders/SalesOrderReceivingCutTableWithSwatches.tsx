"use client";

import { useMemo } from "react";
import { FabricSwatchProvider } from "@/components/fabric/FabricSwatchProvider";
import {
  SalesOrderReceivingCutTable,
  type SalesOrderReceivingCutTableProps,
} from "@/components/orders/SalesOrderReceivingCutTable";

type SalesOrderReceivingCutTableWithSwatchesProps = SalesOrderReceivingCutTableProps & {
  /** Use eager image loading so swatches appear before the browser print dialog. */
  swatchLoading?: "lazy" | "eager";
};

export function SalesOrderReceivingCutTableWithSwatches({
  rows,
  swatchLoading = "lazy",
  ...rest
}: SalesOrderReceivingCutTableWithSwatchesProps) {
  const swatchFabrics = useMemo(
    () =>
      rows.map((row) => ({
        supplier_id: row.supplier_id,
        fabric_number: row.fabric_number,
      })),
    [rows]
  );

  return (
    <FabricSwatchProvider fabrics={swatchFabrics}>
      <SalesOrderReceivingCutTable rows={rows} swatchLoading={swatchLoading} {...rest} />
    </FabricSwatchProvider>
  );
}
