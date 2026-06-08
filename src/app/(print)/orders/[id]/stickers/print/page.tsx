import { StickerPrintSheet } from "@/components/orders/StickerPrintSheet";
import { getSalesOrderById } from "@/lib/data/sales-orders";
import { notFound } from "next/navigation";

/** Dedicated print window — no dashboard sidebar/header. Open in a new tab for roll labels. */
export default async function StickerPrintOnlyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ po?: string; po_id?: string; sheet?: string }>;
}) {
  const { id } = await params;
  const { po, po_id: poId, sheet: sheetParam } = await searchParams;
  const order = getSalesOrderById(id);
  if (!order) notFound();

  const sheet = sheetParam === "fabric-cuts" ? "fabric-cuts" : "pieces";

  return <StickerPrintSheet salesOrderId={id} poNumber={po} poId={poId} sheet={sheet} />;
}
