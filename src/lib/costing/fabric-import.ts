import { readCostingRates } from "@/lib/costing/rates";
import { isWarehouseStockSupplier } from "@/lib/fabric-sourcing/supplier-aliases";

export type FabricImportCostBreakdown = {
  fabric_base_sar: number;
  customs_duty_sar: number;
  import_vat_sar: number;
  /** VAT paid at customs — reclaimable, but cash tied up until claimed */
  vat_recoverable_sar: number;
  /** Total cash paid at import: base + duty + VAT */
  fabric_cash_outlay_sar: number;
  /** True fabric cost for garment costing: base + duty (recoverable VAT excluded) */
  fabric_cost_sar: number;
  is_imported: boolean;
};

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** Warehouse / local stock — already in KSA, no import duty or VAT on arrival */
export function isImportedFabricSupplier(supplierId: string): boolean {
  return !isWarehouseStockSupplier(supplierId);
}

export function getFabricImportRates(): { customs_duty_rate: number; import_vat_rate: number } {
  const file = readCostingRates();
  const rates = file.fabric_import;
  return {
    customs_duty_rate: rates?.customs_duty_rate ?? 0.05,
    import_vat_rate: rates?.import_vat_rate ?? 0.15,
  };
}

export function computeFabricImportCost(
  fabricBaseSar: number,
  supplierId: string
): FabricImportCostBreakdown | null {
  if (fabricBaseSar <= 0) return null;

  if (!isImportedFabricSupplier(supplierId)) {
    const base = roundMoney(fabricBaseSar);
    return {
      fabric_base_sar: base,
      customs_duty_sar: 0,
      import_vat_sar: 0,
      vat_recoverable_sar: 0,
      fabric_cash_outlay_sar: base,
      fabric_cost_sar: base,
      is_imported: false,
    };
  }

  const { customs_duty_rate, import_vat_rate } = getFabricImportRates();
  const base = roundMoney(fabricBaseSar);
  const customsDuty = roundMoney(base * customs_duty_rate);
  const vatBase = base + customsDuty;
  const importVat = roundMoney(vatBase * import_vat_rate);

  return {
    fabric_base_sar: base,
    customs_duty_sar: customsDuty,
    import_vat_sar: importVat,
    vat_recoverable_sar: importVat,
    fabric_cash_outlay_sar: roundMoney(base + customsDuty + importVat),
    fabric_cost_sar: roundMoney(base + customsDuty),
    is_imported: true,
  };
}
