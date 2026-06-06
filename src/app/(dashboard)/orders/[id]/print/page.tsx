import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { SalesOrderPrintToolbar } from "@/components/orders/SalesOrderPrintToolbar";
import {
  FABRIC_PRICE_UNLOCK_COOKIE,
  hasFabricPriceAccess,
  redactSalesOrderFabricPrices,
} from "@/lib/auth/fabric-price-access";
import { getSessionContext } from "@/lib/auth/session";
import { formatSupplierUnitPrice } from "@/lib/currency/format";
import { getSalesOrderById } from "@/lib/data/sales-orders";
import {
  buildFabricLineArticleMap,
  formatLabelGarmentDescription,
  productionCodeFromSticker,
  supplierFabricProductionCode,
} from "@/lib/sales-orders/label-codes";
import { productionBrandNameForOrder } from "@/lib/sales-orders/production-brand";
import {
  CompositionCell,
  receivingCutRowFromFabricLine,
  SalesOrderReceivingCutTable,
} from "@/components/orders/SalesOrderReceivingCutTable";
import { qrImageUrl } from "@/lib/production/qr-labels";
import {
  fabricSupplierGroupKey,
  formatFabricSupplierName,
} from "@/lib/fabric-sourcing/supplier-display";
import { formatSalesOrderLineStock, orderLineHasStockAlert } from "@/lib/fabric-sourcing/fabric-stock";
import { getDeliveryDestination } from "@/lib/shipping/delivery-destinations";
import { formatTotalFabricWeightKg } from "@/lib/sales-orders/fabric-weight";
import { formatDate } from "@/lib/utils";
import type { SalesOrderFabricLine } from "@/lib/types/sales-orders";

function fabricBrandLabel(line: SalesOrderFabricLine): string {
  return formatFabricSupplierName(line.supplier_id, line.supplier_name, line.fabric_number);
}

function fabricWeightLabel(line: SalesOrderFabricLine): string {
  return line.weight_gsm != null ? `${line.weight_gsm} gsm` : "—";
}

function formatWidth(line: SalesOrderFabricLine): string {
  if (line.width_cm != null) return `${line.width_cm} cm`;
  if (line.width_inches != null) return `${line.width_inches}"`;
  return "—";
}

const teamPrintCell = "py-4 pr-2 align-top print:py-1.5 print:pr-1.5 print:text-[10px]";
const teamPrintHead = "py-2 pr-2 print:pr-1.5 print:text-[9px]";

function formatLinePrice(line: SalesOrderFabricLine, showPrices: boolean): string {
  if (!showPrices) return "—";
  if (!line.unit_price) return "—";
  return formatSupplierUnitPrice(line.unit_price, line.supplier_id, line.unit);
}

function groupLinesBySupplier(lines: SalesOrderFabricLine[]) {
  return lines.reduce<
    Record<string, { name: string; lines: SalesOrderFabricLine[] }>
  >((acc, line) => {
    const key = fabricSupplierGroupKey(line.supplier_id, line.fabric_number);
    const name = formatFabricSupplierName(line.supplier_id, line.supplier_name, line.fabric_number);
    const bucket = acc[key] ?? { name, lines: [] };
    bucket.lines.push(line);
    acc[key] = bucket;
    return acc;
  }, {});
}

export default async function SalesOrderPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ team?: string }>;
}) {
  const { id } = await params;
  const { team: teamParam } = await searchParams;
  const team =
    teamParam === "receiving" || teamParam === "production" ? teamParam : ("full" as const);
  const rawOrder = getSalesOrderById(id);
  if (!rawOrder) notFound();

  const session = await getSessionContext();
  const cookieStore = await cookies();
  const canViewFabricPrices = hasFabricPriceAccess(
    session,
    cookieStore.get(FABRIC_PRICE_UNLOCK_COOKIE)?.value
  );
  const order = canViewFabricPrices ? rawOrder : redactSalesOrderFabricPrices(rawOrder);
  const supplierGroups = groupLinesBySupplier(order.fabric_lines);
  const totalMeters = order.fabric_lines.reduce((sum, line) => sum + line.quantity, 0);
  const totalWeightLabel = formatTotalFabricWeightKg(order.fabric_lines);
  const showStock = order.fabric_lines.some(orderLineHasStockAlert);
  const shipLabel =
    getDeliveryDestination(order.delivery_destination)?.label ?? order.delivery_destination ?? "Not set";
  const articleByLineId = buildFabricLineArticleMap(order.fabric_lines.map((line) => line.id));
  const productionBrand = productionBrandNameForOrder(order);

  return (
    <div className="sales-order-print min-h-screen bg-white p-8 text-slate-900 print:min-h-0 print:p-0">
      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 8mm;
          }
          html,
          body {
            height: auto !important;
            overflow: visible !important;
            background: white !important;
          }
          .flex.h-screen,
          .flex.h-screen > div,
          main {
            height: auto !important;
            overflow: visible !important;
          }
          aside,
          header,
          nav,
          .no-print {
            display: none !important;
          }
          main {
            margin: 0 !important;
            padding: 0 !important;
          }
          .sales-order-print {
            padding: 0 !important;
          }
          .print-receiving-table {
            page-break-inside: auto;
          }
          .print-receiving-table thead {
            display: table-header-group;
          }
          .print-receiving-table tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .print-receiving-table td,
          .print-receiving-table th {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

      <SalesOrderPrintToolbar orderId={order.id} soNumber={order.so_number} team={team} />

      <div className="mx-auto max-w-4xl print:max-w-none">
        <div className="mb-8 flex items-start justify-between border-b border-slate-200 pb-6 print:mb-4 print:pb-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {team === "receiving"
                ? "Fabric receiving & wash"
                : team === "production"
                  ? "Production — piece stickers"
                  : "Sales order"}
            </p>
            <h1 className="mt-1 text-3xl font-bold">{order.so_number}</h1>
            <p className="mt-3 text-xl font-bold uppercase tracking-wide text-slate-900">{productionBrand}</p>
            <p className="mt-1 text-xs text-slate-500">
              Production brand — follow this brand&apos;s stitching specification
            </p>
            <p className="mt-3 text-sm text-slate-600">Order date: {formatDate(order.order_date)}</p>
            {order.delivery_date && (
              <p className="text-sm text-slate-600">Delivery: {formatDate(order.delivery_date)}</p>
            )}
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold">Garment Factory</p>
            <p className="text-slate-600">Production order summary</p>
          </div>
        </div>

        <div className="mb-8 grid gap-6 sm:grid-cols-2 print:mb-4 print:gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {order.retail_brand ? "Retail brand" : "Client"}
            </p>
            <p className="mt-2 font-semibold">{order.client_name}</p>
            <p className="font-mono text-sm text-slate-600">{order.client_code}</p>
            {order.product_article && (
              <p className="mt-1 text-sm text-slate-600">Article: {order.product_article}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Order details</p>
            {order.client_reference && (
              <p className="mt-2 text-sm">Client reference: {order.client_reference}</p>
            )}
            <p className="text-sm text-slate-600">
              Ship fabrics to: {shipLabel}
            </p>
            <p className="text-sm text-slate-600">Status: {order.status.replace(/_/g, " ")}</p>
            <p className="text-sm text-slate-600">
              {order.fabric_lines.length} fabric line{order.fabric_lines.length !== 1 ? "s" : ""} ·{" "}
              {totalMeters.toFixed(1)} m total
              {totalWeightLabel ? ` · ${totalWeightLabel}` : ""}
            </p>
          </div>
        </div>

        {team === "receiving" && (
          <p className="mb-6 text-sm text-slate-600 print:mb-3 print:text-xs">
            One fabric cut QR per line — receiving & washing scan these when fabric arrives (before jacket / trouser
            split).
          </p>
        )}
        {team === "production" && (
          <p className="mb-6 text-sm text-slate-600 print:mb-3 print:text-xs">
            One QR per garment piece — after fabric prep, stick on jacket, trouser, shirt, etc. Suit fabric = 2 piece
            codes.
          </p>
        )}

        {team === "full" && (
        <div className="space-y-8">
          {Object.entries(supplierGroups).map(([groupKey, group]) => (
            <section key={groupKey}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700">
                {group.name}
              </h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Art.</th>
                    <th className="py-2 pr-3">Fabric</th>
                    <th className="py-2 pr-3">Garment</th>
                    <th className="py-2 pr-3">Labels</th>
                    <th className="py-2 pr-3">Composition</th>
                    <th className="py-2 pr-3">Weight</th>
                    <th className="py-2 pr-3">Width</th>
                    <th className="py-2 pr-3">Qty</th>
                    {showStock ? <th className="py-2 pr-3">Stock</th> : null}
                    {canViewFabricPrices ? <th className="py-2 text-right">Unit price</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {group.lines.map((line) => (
                    <tr key={line.id} className="border-b border-slate-100 align-top">
                      <td className="py-3 pr-3 text-center font-semibold text-slate-900">
                        {articleByLineId.get(line.id)}
                      </td>
                      <td className="py-3 pr-3 font-mono font-medium">{line.fabric_number}</td>
                      <td className="py-3 pr-3">{line.garment_type}</td>
                      <td className="py-3 pr-3">{line.label_count}</td>
                      <td className="py-3 pr-3 text-slate-600">{line.composition ?? "—"}</td>
                      <td className="py-3 pr-3 text-slate-600">
                        {line.weight_gsm != null ? `${line.weight_gsm} gsm` : "—"}
                      </td>
                      <td className="py-3 pr-3 text-slate-600">{formatWidth(line)}</td>
                      <td className="py-3 pr-3 font-medium">
                        {line.quantity} {line.unit === "meters" ? "m" : line.unit}
                      </td>
                      {showStock ? (
                        <td className="py-3 pr-3 text-amber-800">
                          {formatSalesOrderLineStock(line) ?? "—"}
                        </td>
                      ) : null}
                      {canViewFabricPrices ? (
                        <td className="py-3 text-right text-slate-600">{formatLinePrice(line, true)}</td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
        )}

        {team === "receiving" && order.fabric_lines.length > 0 && (
          <div className="mt-8 border-t border-slate-200 pt-6 print:mt-0 print:border-0 print:pt-0">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-700 print:mb-2">
              Fabric cut QR — receive / wash
            </h2>
            <SalesOrderReceivingCutTable
              rows={order.fabric_lines.map((line) => {
                const art = articleByLineId.get(line.id) ?? 0;
                const stickers = line.label_stickers ?? [];
                const firstCode =
                  stickers[0]?.code ??
                  `${order.client_reference ?? order.so_number}-L${String(art).padStart(2, "0")}`;
                const fabricCutCode = supplierFabricProductionCode(firstCode, order.client_code);
                return receivingCutRowFromFabricLine(line, art, fabricCutCode);
              })}
            />
          </div>
        )}

        {(team === "full" || team === "production") &&
          order.fabric_lines.some((line) => (line.label_stickers ?? []).length > 0) && (
          <div className="mt-8 border-t border-slate-200 pt-6 print:mt-0 print:border-0 print:pt-0">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-700 print:mb-2">
              {team === "production" ? "Piece sticker codes — cutting / sewing" : "Label sticker codes"}
            </h2>
            <p className="mb-6 text-xs text-slate-500 print:hidden">
              Art. # matches fabric table — one row per piece (suit = jacket + trouser)
            </p>
            <table className="print-receiving-table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className={teamPrintHead}>Art.</th>
                  <th className={teamPrintHead}>QR</th>
                  <th className={teamPrintHead}>Piece code</th>
                  <th className={teamPrintHead}>Fabric #</th>
                  <th className={teamPrintHead}>Brand</th>
                  <th className={teamPrintHead}>Composition</th>
                  <th className={teamPrintHead}>Weight</th>
                  <th className={teamPrintHead}>Width</th>
                  <th className={teamPrintHead}>Garment</th>
                </tr>
              </thead>
              <tbody>
                {order.fabric_lines.flatMap((line) =>
                  (line.label_stickers ?? []).map((sticker) => {
                    const productionCode = productionCodeFromSticker(sticker.code, order.client_code);
                    return (
                      <tr key={sticker.code} className="border-b border-slate-200 align-top">
                        <td className={`${teamPrintCell} text-center font-semibold text-slate-900`}>
                          {articleByLineId.get(line.id)}
                        </td>
                        <td className={teamPrintCell}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={qrImageUrl(productionCode, 96)}
                            alt=""
                            width={48}
                            height={48}
                            className="h-14 w-14 print:h-11 print:w-11"
                          />
                        </td>
                        <td className={`${teamPrintCell} font-mono font-medium text-indigo-800`}>
                          {productionCode}
                        </td>
                        <td className={`${teamPrintCell} font-mono text-slate-700`}>{line.fabric_number}</td>
                        <td className={`${teamPrintCell} max-w-[24mm] whitespace-normal text-slate-700`}>
                          {fabricBrandLabel(line)}
                        </td>
                        <CompositionCell composition={line.composition} />
                        <td className={`${teamPrintCell} text-slate-600`}>{fabricWeightLabel(line)}</td>
                        <td className={`${teamPrintCell} text-slate-600`}>{formatWidth(line)}</td>
                        <td className={`${teamPrintCell} text-slate-600`}>
                          {formatLabelGarmentDescription(line.garment_type, sticker.piece_name)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {order.notes && team === "full" && (
          <div className="mt-8 border-t border-slate-200 pt-4 text-sm text-slate-600">
            <p className="font-medium text-slate-700">Notes</p>
            <p className="mt-1 whitespace-pre-wrap">{order.notes}</p>
          </div>
        )}

        <p className="mt-10 text-xs text-slate-400 print:mt-4">
          Generated {new Date().toLocaleString()} · {order.so_number}
        </p>
      </div>
    </div>
  );
}
