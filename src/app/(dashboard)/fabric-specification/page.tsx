import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { FabricSpecView } from "@/components/fabric-specification/FabricSpecView";
import { canViewPrices, redactSupplierFabricPrices } from "@/lib/auth/fabric-price-access";
import { getSessionContext } from "@/lib/auth/session";
import { getBrandsByFabricSourcing } from "@/lib/data/factory-brands";
import { EUR_TO_SAR, USD_TO_SAR } from "@/lib/currency/config";
import { getFabricSuppliers, getPriceListItems } from "@/lib/data/queries";

export default async function FabricSpecificationPage() {
  const session = await getSessionContext();
  const [suppliers, rawItems] = await Promise.all([getFabricSuppliers(), getPriceListItems()]);
  const showPrices = canViewPrices(session);
  const items = showPrices ? rawItems : redactSupplierFabricPrices(rawItems);

  const brandsWithData = suppliers.filter((s) =>
    items.some((i) => i.supplier_id === s.id)
  ).length;
  const suppliersWithData = brandsWithData;

  const totalItems = items.length;

  const supplierBrands = getBrandsByFabricSourcing("supplier_catalog");

  return (
    <div>
      <PageHeader
        title="Fabric Specification"
        description={
          showPrices
            ? "Supplier fabric specs, list prices, and HS codes — for Fouad Rahme and Fouad production"
            : "Supplier fabric specs and HS codes — list prices are hidden for your account"
        }
      />

      <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900">
        <p className="font-medium">For {supplierBrands.map((b) => b.name).join(" & ")}</p>
        <p className="mt-1 text-blue-800">
          {suppliersWithData} supplier{suppliersWithData !== 1 ? "s" : ""} loaded · {totalItems.toLocaleString()}{" "}
          fabric{totalItems !== 1 ? "s" : ""}
          {showPrices ? (
            <>
              {" "}
              with list prices. Original EUR/USD from supplier lists; SAR shown at book rate EUR 1 = SAR{" "}
              {EUR_TO_SAR.toFixed(2)}, USD 1 = SAR {USD_TO_SAR.toFixed(2)}. Order via{" "}
              <Link href="/purchasing" className="font-medium underline">
                Purchasing
              </Link>
              .
            </>
          ) : (
            ". Specs only — prices are not shown on your account."
          )}{" "}
          <Link href="/brands" className="font-medium underline">
            Gliani
          </Link>{" "}
          uses warehouse stock instead — see Inventory.
        </p>
      </div>

      <FabricSpecView suppliers={suppliers} items={items} canViewPrices={showPrices} />
    </div>
  );
}
