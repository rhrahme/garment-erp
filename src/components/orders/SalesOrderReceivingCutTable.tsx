import type { ReactNode } from "react";
import { formatFabricSupplierName } from "@/lib/fabric-sourcing/supplier-display";
import { cn } from "@/lib/utils";
import { qrImageUrl } from "@/lib/production/qr-labels";
import type { SalesOrderFabricLine } from "@/lib/types/sales-orders";

export type ReceivingCutTableRow = {
  line_id: string;
  article_number: number;
  fabric_cut_code: string;
  fabric_number: string;
  supplier_id: string;
  supplier_name: string;
  composition: string | null;
  weight_gsm: number | null;
  width_cm: number | null;
  width_inches: number | null;
  garment_type: string;
  fabric_meters: number;
};

const teamPrintCell = "py-4 pr-2 align-top print:py-1.5 print:pr-1.5 print:text-[10px]";
const teamPrintHead = "py-2 pr-2 print:pr-1.5 print:text-[9px]";

function formatWidth(line: Pick<ReceivingCutTableRow, "width_cm" | "width_inches">): string {
  if (line.width_cm != null) return `${line.width_cm} cm`;
  if (line.width_inches != null) return `${line.width_inches}"`;
  return "—";
}

function fabricBrandLabel(line: Pick<ReceivingCutTableRow, "supplier_id" | "supplier_name" | "fabric_number">): string {
  return formatFabricSupplierName(line.supplier_id, line.supplier_name, line.fabric_number);
}

function fabricWeightLabel(line: Pick<ReceivingCutTableRow, "weight_gsm">): string {
  return line.weight_gsm != null ? `${line.weight_gsm} gsm` : "—";
}

/** Split long composition — name on line 1, fibre content (e.g. 100% LINEN) on line 2. */
export function compositionDisplayLines(composition: string | null): { line1: string; line2: string | null } {
  if (!composition?.trim()) return { line1: "—", line2: null };

  const text = composition.trim();
  const fiberMatch = text.match(/\s+(\d+\s*%[\dA-Za-z.\s/'-]+)$/i);
  if (fiberMatch && fiberMatch.index != null && fiberMatch.index > 8) {
    return {
      line1: text.slice(0, fiberMatch.index).trim(),
      line2: fiberMatch[1]!.trim(),
    };
  }

  if (text.length > 32) {
    const mid = Math.floor(text.length / 2);
    const splitAt = text.lastIndexOf(" ", mid);
    if (splitAt > 10) {
      return {
        line1: text.slice(0, splitAt).trim(),
        line2: text.slice(splitAt).trim(),
      };
    }
  }

  return { line1: text, line2: null };
}

export function CompositionCell({
  composition,
  className,
}: {
  composition: string | null;
  className?: string;
}) {
  const { line1, line2 } = compositionDisplayLines(composition);
  return (
    <td className={cn(teamPrintCell, "max-w-[34mm] whitespace-normal text-slate-600", className)}>
      <span className="block leading-snug">{line1}</span>
      {line2 ? <span className="mt-0.5 block leading-snug text-slate-500">{line2}</span> : null}
    </td>
  );
}

export function receivingCutRowFromFabricLine(
  line: SalesOrderFabricLine,
  article_number: number,
  fabric_cut_code: string
): ReceivingCutTableRow {
  return {
    line_id: line.id,
    article_number,
    fabric_cut_code,
    fabric_number: line.fabric_number,
    supplier_id: line.supplier_id,
    supplier_name: line.supplier_name,
    composition: line.composition,
    weight_gsm: line.weight_gsm,
    width_cm: line.width_cm,
    width_inches: line.width_inches,
    garment_type: line.garment_type,
    fabric_meters: line.quantity,
  };
}

type SalesOrderReceivingCutTableProps = {
  rows: ReceivingCutTableRow[];
  /** Optional extra column(s) after Meters — e.g. scan status on the floor. */
  renderTrailingCell?: (row: ReceivingCutTableRow) => ReactNode;
  trailingHead?: string;
  rowClassName?: (row: ReceivingCutTableRow) => string | undefined;
  /** Scan-stage background — applied to every cell so highlights show in tables. */
  rowHighlightClassName?: (row: ReceivingCutTableRow) => string | undefined;
};

export function SalesOrderReceivingCutTable({
  rows,
  renderTrailingCell,
  trailingHead,
  rowClassName,
  rowHighlightClassName,
}: SalesOrderReceivingCutTableProps) {
  if (rows.length === 0) return null;

  return (
    <table className="print-receiving-table w-full text-sm">
      <thead>
        <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
          <th className={teamPrintHead}>Art.</th>
          <th className={teamPrintHead}>QR</th>
          <th className={teamPrintHead}>Fabric cut</th>
          <th className={teamPrintHead}>Fabric #</th>
          <th className={teamPrintHead}>Brand</th>
          <th className={teamPrintHead}>Composition</th>
          <th className={teamPrintHead}>Weight</th>
          <th className={teamPrintHead}>Width</th>
          <th className={teamPrintHead}>Garment</th>
          <th className={teamPrintHead}>Meters</th>
          {renderTrailingCell && trailingHead ? <th className={teamPrintHead}>{trailingHead}</th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const highlight = rowHighlightClassName?.(row) ?? "";
          const cell = (...extra: Array<string | undefined>) => cn(teamPrintCell, highlight, ...extra);

          return (
            <tr
              key={row.line_id}
              className={rowClassName?.(row) ?? cn("border-b border-slate-200 align-top", highlight)}
            >
              <td className={cell("text-center font-semibold")}>{row.article_number}</td>
              <td className={cell()}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrImageUrl(row.fabric_cut_code, 96)}
                  alt=""
                  width={48}
                  height={48}
                  className="h-14 w-14 print:h-11 print:w-11"
                />
              </td>
              <td className={cell("font-mono font-medium text-indigo-800")}>{row.fabric_cut_code}</td>
              <td className={cell("font-mono")}>{row.fabric_number}</td>
              <td className={cell("max-w-[24mm] whitespace-normal text-slate-700")}>{fabricBrandLabel(row)}</td>
              <CompositionCell composition={row.composition} className={highlight} />
              <td className={cell("text-slate-600")}>{fabricWeightLabel(row)}</td>
              <td className={cell("text-slate-600")}>{formatWidth(row)}</td>
              <td className={cell()}>{row.garment_type}</td>
              <td className={cell("font-medium")}>{row.fabric_meters} m</td>
              {renderTrailingCell ? <td className={cell()}>{renderTrailingCell(row)}</td> : null}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
