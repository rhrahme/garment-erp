import { StickerPrintSheet } from "@/components/orders/StickerPrintSheet";
import { PageHeader } from "@/components/ui/PageHeader";
import { getSessionContext } from "@/lib/auth/session";
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

export default async function OrderStickersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ po?: string; po_id?: string; sheet?: string }>;
}) {
  const { id } = await params;
  const { po, po_id: poId, sheet: sheetParam } = await searchParams;
  const session = await getSessionContext();
  const order = getSalesOrderById(id);
  if (!order) notFound();

  const sheet = resolveStickerSheet(sheetParam, session.isClientManager);

  return (
    <div>
      <PageHeader
        title={sheet === "fabric-cuts" ? "Print fabric cut stickers" : "Production stickers"}
        description={
          sheet === "fabric-cuts"
            ? `${order.so_number} · ${order.client_name} — one QR per fabric line for receive & wash`
            : `${order.so_number} · ${order.client_name} — one QR per piece (jacket, trouser, …) for cutting & sewing`
        }
      />
      <StickerPrintSheet salesOrderId={id} poNumber={po} poId={poId} sheet={sheet} />
    </div>
  );
}
