import { StickerPrintSheet } from "@/components/orders/StickerPrintSheet";
import { getSessionContext } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { getSalesOrderById } from "@/lib/data/sales-orders";
import { notFound } from "next/navigation";

function resolveStickerSheet(
  sheetParam: string | undefined,
  isClientManager: boolean
): "fabric-cuts" | "pieces" {
  if (sheetParam === "fabric-cuts") return "fabric-cuts";
  if (sheetParam === "pieces") return "pieces";
  return isClientManager ? "fabric-cuts" : "pieces";
}

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
  const session = await getSessionContext();
  await ensureDocumentsLoaded(["sales_orders"]);
  const order = getSalesOrderById(id);
  if (!order) notFound();

  const sheet = resolveStickerSheet(sheetParam, session.isClientManager);

  return <StickerPrintSheet salesOrderId={id} poNumber={po} poId={poId} sheet={sheet} />;
}
