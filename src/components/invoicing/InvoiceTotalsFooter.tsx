import { sarToDhs } from "@/lib/currency/config";
import { formatInvoiceDhs, formatInvoiceSar } from "@/lib/invoicing/format-amount";

export const DHS_TOTAL_LABEL = "Equivalent in UAE Dirhams (DHS)";
/** Highlight the payable DHS amount in editor, print, and browser PDF. */
const DHS_TOTAL_ROW_CLASS =
  "bg-slate-200 print:bg-slate-200 [print-color-adjust:exact] [-webkit-print-color-adjust:exact]";

export type InvoiceTotalsFooterProps = {
  currency: "SAR";
  subtotal: number;
  vatRate: number | null;
  vatAmount: number;
  total: number;
  showDhsEquivalent: boolean;
  /** `print` = InvoiceDocument/PDF; `editor` = line-editing table with cost-hint column */
  variant: "print" | "editor";
  /** Headline count of individual garment pieces (combo sets expanded). */
  totalGarmentItems?: number | null;
  /** Sum of raw line quantities (combo set with qty 1 counts as 1). */
  totalQuantity?: number | null;
};

export function InvoiceTotalsFooter({
  currency,
  subtotal,
  vatRate,
  vatAmount,
  total,
  showDhsEquivalent,
  variant,
  totalGarmentItems,
  totalQuantity,
}: InvoiceTotalsFooterProps) {
  const dhsSubtotal = showDhsEquivalent ? sarToDhs(subtotal) : null;
  const dhsVatAmount =
    showDhsEquivalent && vatRate != null && vatRate > 0 ? sarToDhs(vatAmount) : null;
  const dhsTotal = showDhsEquivalent ? sarToDhs(total) : null;

  const isPrint = variant === "print";
  const labelColSpan = 5;
  const pad = isPrint ? "" : "px-4 ";
  const labelAlign = "text-right";
  const amountAlign = "text-right";
  const showGarmentItems = totalGarmentItems != null;
  const showQuantity = totalQuantity != null;
  const hasCountSummary = showGarmentItems || showQuantity;
  const subtotalBorder = isPrint || hasCountSummary ? undefined : "border-t border-slate-200";

  return (
    <>
      {showGarmentItems && (
        <tr className={isPrint ? undefined : "border-t border-slate-200"}>
          <td colSpan={labelColSpan} className={`${pad}py-2 ${labelAlign} font-medium text-slate-700`}>
            Total garment items
          </td>
          <td className={`${pad}py-2 ${amountAlign} font-semibold text-slate-900`}>
            {totalGarmentItems}
          </td>
          {!isPrint && <td className={`${pad}py-2`} />}
        </tr>
      )}
      {showQuantity && (
        <tr>
          <td colSpan={labelColSpan} className={`${pad}pb-2 ${labelAlign} text-slate-500`}>
            Total quantity
          </td>
          <td className={`${pad}pb-2 ${amountAlign} font-medium text-slate-600`}>{totalQuantity}</td>
          {!isPrint && <td className={`${pad}pb-2`} />}
        </tr>
      )}
      <tr className={subtotalBorder}>
        <td colSpan={labelColSpan} className={`${pad}py-2 ${labelAlign} text-slate-600`}>
          Subtotal ({currency})
        </td>
        <td className={`${pad}py-2 ${amountAlign} font-medium`}>{formatInvoiceSar(subtotal)}</td>
        {!isPrint && <td className={`${pad}py-2`} />}
      </tr>
      {dhsSubtotal != null && (
        <tr>
          <td colSpan={labelColSpan} className={`${pad}pb-2 ${labelAlign} text-slate-500`}>
            Subtotal (DHS)
          </td>
          <td className={`${pad}pb-2 ${amountAlign} font-medium text-slate-600`}>
            {formatInvoiceDhs(dhsSubtotal)}
          </td>
          {!isPrint && <td className={`${pad}pb-2`} />}
        </tr>
      )}
      {vatRate != null && vatRate > 0 && (
        <tr>
          <td colSpan={labelColSpan} className={`${pad}py-2 ${labelAlign} text-slate-600`}>
            VAT ({Math.round(vatRate * 100)}%)
          </td>
          <td className={`${pad}py-2 ${amountAlign} font-medium`}>{formatInvoiceSar(vatAmount)}</td>
          {!isPrint && <td className={`${pad}py-2`} />}
        </tr>
      )}
      {dhsVatAmount != null && (
        <tr>
          <td colSpan={labelColSpan} className={`${pad}pb-2 ${labelAlign} text-slate-500`}>
            VAT (DHS)
          </td>
          <td className={`${pad}pb-2 ${amountAlign} font-medium text-slate-600`}>
            {formatInvoiceDhs(dhsVatAmount)}
          </td>
          {!isPrint && <td className={`${pad}pb-2`} />}
        </tr>
      )}
      <tr>
        <td
          colSpan={labelColSpan}
          className={`${pad}${isPrint ? "py-4" : "border-t border-slate-200 bg-slate-50 py-3"} ${labelAlign} font-semibold`}
        >
          Total ({currency})
        </td>
        <td
          className={`${pad}${isPrint ? "py-4" : "border-t border-slate-200 bg-slate-50 py-3"} ${amountAlign} ${isPrint ? "text-lg" : ""} font-bold`}
        >
          {formatInvoiceSar(total)}
        </td>
        {!isPrint && <td className={`${pad}border-t border-slate-200 bg-slate-50 py-3`} />}
      </tr>
      {dhsTotal != null && (
        <tr className={DHS_TOTAL_ROW_CLASS}>
          <td
            colSpan={labelColSpan}
            className={`${pad}${DHS_TOTAL_ROW_CLASS} py-2 ${isPrint ? "pb-4" : "pb-3"} ${labelAlign} whitespace-nowrap font-semibold text-slate-700`}
          >
            {DHS_TOTAL_LABEL}
          </td>
          <td
            className={`${pad}${DHS_TOTAL_ROW_CLASS} py-2 ${isPrint ? "pb-4" : "pb-3"} ${amountAlign} whitespace-nowrap ${isPrint ? "text-lg" : ""} font-bold text-slate-800`}
          >
            {formatInvoiceDhs(dhsTotal)}
          </td>
          {!isPrint && <td className={`${pad}${DHS_TOTAL_ROW_CLASS} py-2 pb-3`} />}
        </tr>
      )}
    </>
  );
}
