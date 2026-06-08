import { PageHeader, DataTable } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { getBrandsByFabricSourcing } from "@/lib/data/factory-brands";
import { getInventory } from "@/lib/data/queries";
import { formatNumber } from "@/lib/utils";
import Link from "next/link";

export default async function InventoryPage() {
  const items = await getInventory();
  const stockBrands = getBrandsByFabricSourcing("warehouse_stock");

  return (
    <div>
      <PageHeader
        title="Inventory"
        description={`Physical warehouse stock — used for ${stockBrands.map((b) => b.name).join(", ")} and all received fabric`}
        action={<Button>+ Receive Stock</Button>}
      />

      <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
        <p className="font-medium">{stockBrands.map((b) => b.name).join(" ")} stock fabrics</p>
        <p className="mt-1 text-emerald-800">
          Gliani production uses Canclini linen from this warehouse — not supplier price lists. Wool Stock
          references are also held here. Search{" "}
          <strong>Canclini</strong> or <strong>Wool Stock</strong> on orders or in{" "}
          <Link href="/fabric-specification" className="font-medium underline">
            Fabric Specification
          </Link>{" "}
          for 52 linen codes (25T lightweight / 25H heavyweight). Supplier-ordered fabric for{" "}
          <Link href="/brands" className="font-medium underline">
            Fouad Rahme & Fouad
          </Link>{" "}
          also lands here when shipments arrive.
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900">
        <p className="font-medium">Not the same as a price list</p>
        <p className="mt-1 text-blue-800">
          Supplier catalogs (Caccioppoli, Zegna, Drapers) are reference prices in{" "}
          <Link href="/fabric-specification" className="font-medium underline">
            Fabric Specification
          </Link>
          . This page is what you physically have on hand.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center">
          <p className="text-lg font-medium text-slate-700">No stock on hand yet</p>
          <p className="mt-2 text-sm text-slate-500">
            Gliani stock fabrics will be listed here. Supplier fabric arrives here after AWB delivery.
          </p>
        </div>
      ) : (
        <DataTable
          columns={[
            { key: "code", label: "Code" },
            { key: "name", label: "Material" },
            { key: "type", label: "Type" },
            { key: "onHand", label: "On Hand" },
            { key: "reserved", label: "Reserved" },
            { key: "available", label: "Available" },
            { key: "location", label: "Location" },
            { key: "status", label: "Status" },
          ]}
          rows={items.map((i) => {
            const available = i.quantity_on_hand - i.quantity_reserved;
            const isLow = i.material && i.quantity_on_hand <= i.material.reorder_level;
            return {
              code: <span className="font-medium">{i.material?.code}</span>,
              name: i.material?.name ?? "—",
              type: <span className="capitalize">{i.material?.material_type}</span>,
              onHand: `${formatNumber(i.quantity_on_hand, 0)} ${i.material?.unit}`,
              reserved: `${formatNumber(i.quantity_reserved, 0)} ${i.material?.unit}`,
              available: `${formatNumber(available, 0)} ${i.material?.unit}`,
              location: i.location ?? "—",
              status: isLow ? (
                <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">Low Stock</span>
              ) : (
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">OK</span>
              ),
            };
          })}
        />
      )}
    </div>
  );
}
