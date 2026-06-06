import path from "path";
import { readJsonFile } from "@/lib/data/json-file-cache";
import { isGarmentStitchType } from "@/lib/sales-orders/garment-types";

export type GarmentCostRate = {
  labor: number;
  washing: number;
  overhead: number;
};

export type CostingRatesFile = {
  updated_at: string | null;
  currency: string;
  notes?: string;
  garment_rates: Record<string, GarmentCostRate>;
  default_garment_rate: GarmentCostRate;
  fabric_import?: {
    customs_duty_rate: number;
    import_vat_rate: number;
    notes?: string;
  };
};

const COSTING_RATES_PATH = path.join(process.cwd(), "src/data/costing-rates.json");

const FALLBACK: CostingRatesFile = {
  updated_at: null,
  currency: "SAR",
  garment_rates: {},
  default_garment_rate: { labor: 150, washing: 40, overhead: 50 },
};

export function readCostingRates(): CostingRatesFile {
  return readJsonFile(COSTING_RATES_PATH, FALLBACK);
}

export function getGarmentCostRate(garmentType: string): GarmentCostRate {
  const file = readCostingRates();
  if (isGarmentStitchType(garmentType) && file.garment_rates[garmentType]) {
    return file.garment_rates[garmentType]!;
  }
  return file.garment_rates[garmentType] ?? file.default_garment_rate;
}
