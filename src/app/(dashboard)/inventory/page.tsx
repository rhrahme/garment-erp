import { PageHeader } from "@/components/ui/PageHeader";
import { InventoryWorkspace } from "@/components/inventory/InventoryWorkspace";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readInventoryStoreFresh } from "@/lib/data/inventory-store";
import { readSalesOrders } from "@/lib/data/sales-orders";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  await ensureDocumentsLoaded(["inventory_store", "sales_orders"]);
  const store = await readInventoryStoreFresh();

  // Garment type suggestions for the recipe editor - every type the factory
  // has actually sold, so recipes match real order lines.
  const garmentTypes = Array.from(
    new Set(
      readSalesOrders()
        .orders.flatMap((order) => order.fabric_lines.map((line) => line.garment_type))
        .map((garment) => garment?.trim())
        .filter((garment): garment is string => Boolean(garment))
    )
  ).sort((a, b) => a.localeCompare(b));

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Boxes first: write how many are inside each box, print QR, scan when you open one. Stock is what is already open."
      />
      <InventoryWorkspace
        initialItems={store.items}
        initialRecipes={store.recipes}
        initialLedger={[...store.ledger].reverse().slice(0, 50)}
        initialCartons={store.cartons}
        garmentTypes={garmentTypes}
      />
    </div>
  );
}
