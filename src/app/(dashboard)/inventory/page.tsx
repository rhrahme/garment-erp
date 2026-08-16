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
        description="Factory stock - hangers, trims and accessories. Subtracted automatically per garment when articles are packed."
      />
      <InventoryWorkspace
        initialItems={store.items}
        initialRecipes={store.recipes}
        initialLedger={[...store.ledger].reverse().slice(0, 50)}
        garmentTypes={garmentTypes}
      />
    </div>
  );
}
