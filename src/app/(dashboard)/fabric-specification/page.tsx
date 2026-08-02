import { PageHeader } from "@/components/ui/PageHeader";
import { FabricSpecView } from "@/components/fabric-specification/FabricSpecView";
import { canCreateCustomFabric } from "@/lib/auth/custom-fabric-access";
import { canViewFabricStock, canViewPrices, redactSupplierFabricPrices } from "@/lib/auth/fabric-price-access";
import { getSessionContext } from "@/lib/auth/session";
import { getBrandsByFabricSourcing } from "@/lib/data/factory-brands";
import { EUR_TO_SAR, USD_TO_SAR } from "@/lib/currency/config";
import { getFabricSuppliers, getPriceListItems } from "@/lib/data/queries";

export default async function FabricSpecificationPage() {
  const session = await getSessionContext();
  const [suppliers, rawItems] = await Promise.all([getFabricSuppliers(), getPriceListItems()]);
  const showPrices = canViewPrices(session);
  const showStock = canViewFabricStock(session);
  const allowCreateCustom = canCreateCustomFabric(session);
  /** Sales never receive price fields; admin gets full catalog (eye toggle hides in the client UI). */
  const items = showPrices ? rawItems : redactSupplierFabricPrices(rawItems);

  const brandsWithData = suppliers.filter((s) =>
    items.some((i) => i.supplier_id === s.id)
  ).length;

  const supplierBrands = getBrandsByFabricSourcing("supplier_catalog");

  return (
    <div>
      <PageHeader
        title="Fabric Specification"
        description={
          showPrices
            ? "Supplier fabric specs and HS codes  -  use Hide to conceal list prices on screen"
            : "Supplier fabric specs and HS codes  -  list prices are hidden for your account"
        }
      />

      <FabricSpecView
        suppliers={suppliers}
        items={items}
        canViewPrices={showPrices}
        canViewStock={showStock}
        canCreateCustomFabric={allowCreateCustom}
        catalogSummary={{
          brandNames: supplierBrands.map((b) => b.name),
          suppliersWithData: brandsWithData,
          totalItems: items.length,
          eurToSar: EUR_TO_SAR,
          usdToSar: USD_TO_SAR,
        }}
      />
    </div>
  );
}
