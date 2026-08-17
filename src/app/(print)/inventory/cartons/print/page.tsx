import { notFound } from "next/navigation";
import { CartonStickersPrintView } from "@/components/inventory/CartonStickersPrintView";
import { getSessionContext } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readInventoryStoreFresh } from "@/lib/data/inventory-store";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ ids?: string; item?: string }>;
};

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://erp.hagan.pro").replace(/\/$/, "");
}

/**
 * A4 sheet of carton QR stickers - one per box. Open with ?ids=a,b,c
 * (freshly registered batch) or ?item=<itemId> (every sealed box of an item).
 */
export default async function CartonStickersPrintPage({ searchParams }: PageProps) {
  await getSessionContext();
  const { ids, item } = await searchParams;
  await ensureDocumentsLoaded(["inventory_store"]);
  const store = await readInventoryStoreFresh();

  const wantedIds = new Set(
    (ids ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
  const itemId = (item ?? "").trim();
  const cartons = store.cartons.filter((carton) =>
    wantedIds.size > 0
      ? wantedIds.has(carton.id)
      : itemId
        ? carton.item_id === itemId && carton.status === "sealed"
        : false
  );
  if (cartons.length === 0) notFound();

  const itemById = new Map(store.items.map((row) => [row.id, row]));
  const stickers = cartons.map((carton) => {
    const cartonItem = itemById.get(carton.item_id);
    return {
      carton_id: carton.id,
      status: carton.status,
      quantity: carton.quantity,
      unit: cartonItem?.unit ?? "pcs",
      item_name: cartonItem?.name ?? carton.item_id,
      brand: cartonItem?.brand ?? null,
      open_url: `${appUrl()}/inventory/cartons/${encodeURIComponent(carton.id)}`,
    };
  });

  return <CartonStickersPrintView stickers={stickers} />;
}
