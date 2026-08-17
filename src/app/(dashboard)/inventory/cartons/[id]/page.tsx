import { notFound } from "next/navigation";
import { CartonOpenCard } from "@/components/inventory/CartonOpenCard";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readInventoryStoreFresh } from "@/lib/data/inventory-store";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

/** QR landing page: the floor scans a box sticker and confirms opening it. */
export default async function CartonOpenPage({ params }: PageProps) {
  const { id } = await params;
  await ensureDocumentsLoaded(["inventory_store"]);
  const store = await readInventoryStoreFresh();
  const carton = store.cartons.find((row) => row.id === id);
  if (!carton) notFound();
  const item = store.items.find((row) => row.id === carton.item_id) ?? null;

  return (
    <div className="mx-auto max-w-md py-6">
      <CartonOpenCard
        carton={carton}
        itemName={item?.name ?? carton.item_id}
        itemBrand={item?.brand ?? null}
        unit={item?.unit ?? "pcs"}
        quantityOnHand={item?.quantity_on_hand ?? 0}
      />
    </div>
  );
}
