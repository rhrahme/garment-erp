import { StickerPrintSheet } from "@/components/orders/StickerPrintSheet";
import { PageHeader } from "@/components/ui/PageHeader";
import { getSalesOrderById } from "@/lib/data/sales-orders";
import { notFound } from "next/navigation";

export default async function OrderStickersPage({
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
