import brandsData from "@/data/factory-brands.json";

export type FabricSourcingType = "supplier_catalog" | "warehouse_stock" | "pending";

export interface FactoryBrand {
  id: string;
  code: string;
  name: string;
  description: string | null;
  product_types: string[];
  market: string | null;
  fabric_sourcing: FabricSourcingType;
  is_active: boolean;
  notes: string | null;
}

interface FactoryBrandsFile {
  updated_at: string;
  brands: FactoryBrand[];
}

const catalog = brandsData as FactoryBrandsFile;

export function getFactoryBrands(): FactoryBrand[] {
  return catalog.brands.filter((brand) => brand.is_active);
}

export function getFactoryBrandById(id: string): FactoryBrand | undefined {
  return catalog.brands.find((brand) => brand.id === id);
}

export function getFactoryBrandByCode(code: string): FactoryBrand | undefined {
  return catalog.brands.find((brand) => brand.code === code);
}

export function getBrandsByFabricSourcing(type: FabricSourcingType): FactoryBrand[] {
  return getFactoryBrands().filter((brand) => brand.fabric_sourcing === type);
}

export function formatProductTypes(types: string[]): string {
  if (types.length === 0) return "To be defined";
  return types.map(formatProductType).join(", ");
}

export function formatProductType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getFabricSourcingLabel(type: FabricSourcingType): string {
  switch (type) {
    case "supplier_catalog":
      return "Supplier price lists";
    case "warehouse_stock":
      return "Warehouse stock";
    case "pending":
      return "To be defined";
  }
}

export function getFabricSourcingDescription(type: FabricSourcingType): string {
  switch (type) {
    case "supplier_catalog":
      return "Look up fabrics in Fabric Specification, then order from suppliers (Caccioppoli, Zegna, Drapers, etc.).";
    case "warehouse_stock":
      return "Uses fabrics already in your warehouse — listed under Inventory, not supplier price lists.";
    case "pending":
      return "Fabric sourcing not set up yet.";
  }
}
