import { notFound } from "next/navigation";
import { OrderPrintPack } from "@/components/orders/OrderPrintPack";
import { PrintPackToolbar } from "@/components/orders/PrintPackToolbar";
import {
  receivingCutRowFromFabricLine,
  SalesOrderReceivingCutTable,
} from "@/components/orders/SalesOrderReceivingCutTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { getSalesOrderById } from "@/lib/data/sales-orders";
import {
  buildFabricLineArticleMap,
  supplierFabricProductionCode,
} from "@/lib/sales-orders/label-codes";
import {
  getFabricLinesForA4Print,
  getUnprintedFabricLines,
} from "@/lib/sales-orders/fabric-lines";

export default async function OrderPrintPackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = getSalesOrderById(id);
  if (!order) notFound();

  const articleByLineId = buildFabricLineArticleMap(order.fabric_lines.map((line) => line.id));
  const a4PrintLines = getFabricLinesForA4Print(order.fabric_lines);
  const unprintedA4LineIds = getUnprintedFabricLines(order.fabric_lines, "a4").map((line) => line.id);
  const hasUnprintedA4 = unprintedA4LineIds.length > 0;

  return (
    <div className="order-print-pack min-h-screen bg-white p-8 text-slate-900 print:min-h-0 print:p-0">
      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 8mm;
          }
          .no-print {
            display: none !important;
          }
          .print-pack-stickers {
            display: none !important;
          }
        }
      `}</style>

      <PageHeader
        title="Print packs"
        description={`${order.so_number} · ${order.client_name} — receiving A4 + fabric cut stickers + cutting pack (multi-piece only)`}
      />

      <PrintPackToolbar
        orderId={id}
        soNumber={order.so_number}
        a4LineIds={unprintedA4LineIds}
        a4SheetLineCount={a4PrintLines.length}
      />

      <section className="print-pack-a4 mb-10">
        <div className="no-print mb-4 rounded-lg border border-pink-200 bg-pink-50/50 px-4 py-3">
          <p className="font-semibold text-slate-900">Receiving team pack — A4 sheet</p>
          <p className="mt-1 text-sm text-slate-600">
            Fabric cut codes with QR — match rolls to this sheet at receive. Full order sheet (
            {a4PrintLines.length} line{a4PrintLines.length === 1 ? "" : "s"}).
            {hasUnprintedA4
              ? ` ${unprintedA4LineIds.length} new line${unprintedA4LineIds.length === 1 ? "" : "s"} will be marked printed after this run.`
              : a4PrintLines.length > 0
                ? " Includes previously printed lines — reprint for receiving desk."
                : ""}{" "}
            Print fabric cut roll stickers below (new lines only).
          </p>
        </div>

        <header className="mb-6 border-b border-slate-200 pb-4 print:mb-4 print:pb-2">
          <h1 className="text-xl font-bold text-slate-900 print:text-lg">
            Fabric receiving — {order.so_number}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {order.client_name} · <span className="font-mono font-semibold">{order.client_code}</span>
            {order.client_reference ? ` · Ref ${order.client_reference}` : ""}
          </p>
        </header>

        {a4PrintLines.length > 0 ? (
          <SalesOrderReceivingCutTable
            rows={a4PrintLines.map((line) => {
              const art = articleByLineId.get(line.id) ?? 0;
              const stickers = line.label_stickers ?? [];
              const firstCode =
                stickers[0]?.code ??
                `${order.client_reference ?? order.so_number}-L${String(art).padStart(2, "0")}`;
              const fabricCutCode = supplierFabricProductionCode(firstCode, order.client_code);
              return receivingCutRowFromFabricLine(line, art, fabricCutCode);
            })}
          />
        ) : (
          <p className="text-sm text-slate-500">No fabric lines on this order.</p>
        )}
      </section>

      <OrderPrintPack salesOrderId={id} />
    </div>
  );
}
