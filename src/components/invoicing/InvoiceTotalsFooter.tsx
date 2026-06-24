import { sarToDhs } from "@/lib/currency/config";
import { formatCurrency, formatNumber } from "@/lib/utils";

function formatSar(amount: number): string {
  return formatCurrency(amount, "SAR");
}

function formatDhs(amount: number): string {
  return `${formatNumber(amount, 2)} DHS`;
}

const DHS_TOTAL_LABEL = "Equivalent in UAE Dirhams (DHS)";

export type InvoiceTotalsFooterProps = {
  currency: "SAR";
  subtotal: number;
  vatRate: number | null;
  vatAmount: number;
  total: number;
  showDhsEquivalent: boolean;
  /** `print` = InvoiceDocument/PDF; `editor` = line-editing table with cost-hint column */
  variant: "print" | "editor";
};

export function InvoiceTotalsFooter({
  currency,
  subtotal,
  vatRate,
  vatAmount,
  total,
  showDhsEquivalent,
  variant,
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

  return (
    <>
      <tr className={isPrint ? undefined : "border-t border-slate-200"}>
        <td colSpan={labelColSpan} className={`${pad}py-2 ${labelAlign} text-slate-600`}>
          Subtotal ({currency})
        </td>
        <td className={`${pad}py-2 ${amountAlign} font-medium`}>{formatSar(subtotal)}</td>
        {!isPrint && <td className={`${pad}py-2`} />}
      </tr>
      {dhsSubtotal != null && (
        <tr>
          <td colSpan={labelColSpan} className={`${pad}pb-2 ${labelAlign} text-slate-500`}>
            Subtotal (DHS)
          </td>
          <td className={`${pad}pb-2 ${amountAlign} font-medium text-slate-600`}>
            {formatDhs(dhsSubtotal)}
          </td>
          {!isPrint && <td className={`${pad}pb-2`} />}
        </tr>
      )}
      {vatRate != null && vatRate > 0 && (
        <tr>
          <td colSpan={labelColSpan} className={`${pad}py-2 ${labelAlign} text-slate-600`}>
            VAT ({Math.round(vatRate * 100)}%)
          </td>
          <td className={`${pad}py-2 ${amountAlign} font-medium`}>{formatSar(vatAmount)}</td>
          {!isPrint && <td className={`${pad}py-2`} />}
        </tr>
      )}
      {dhsVatAmount != null && (
        <tr>
          <td colSpan={labelColSpan} className={`${pad}pb-2 ${labelAlign} text-slate-500`}>
            VAT (DHS)
          </td>
          <td className={`${pad}pb-2 ${amountAlign} font-medium text-slate-600`}>
            {formatDhs(dhsVatAmount)}
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
          {formatSar(total)}
        </td>
        {!isPrint && <td className={`${pad}border-t border-slate-200 bg-slate-50 py-3`} />}
      </tr>
      {dhsTotal != null && (
        <tr>
          <td
            colSpan={labelColSpan}
            className={`${pad}${isPrint ? "pb-4" : "bg-slate-50 pb-3"} ${labelAlign} whitespace-nowrap font-semibold text-slate-700`}
          >
            {DHS_TOTAL_LABEL}
          </td>
          <td
            className={`${pad}${isPrint ? "pb-4" : "bg-slate-50 pb-3"} ${amountAlign} whitespace-nowrap ${isPrint ? "text-lg" : ""} font-bold text-slate-800`}
          >
            {formatDhs(dhsTotal)}
          </td>
          {!isPrint && <td className={`${pad}bg-slate-50 pb-3`} />}
        </tr>
      )}
    </>
  );
}
