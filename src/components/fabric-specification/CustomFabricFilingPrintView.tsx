"use client";

import Link from "next/link";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CUSTOM_FABRIC_FILING_PRINT_CSS } from "@/lib/fabric-specification/custom-fabric-print-styles";
import type { CustomFabric } from "@/lib/types/custom-fabrics";

function displayOrDash(value: string | number | null | undefined): string {
  if (value == null) return "-";
  if (typeof value === "number") return String(value);
  const trimmed = value.trim();
  return trimmed || "-";
}

function formatCreatedAt(iso: string | null | undefined): string {
  if (!iso) return "-";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CustomFabricFilingPrintView({ fabric }: { fabric: CustomFabric }) {
  const rows: Array<{ label: string; value: string }> = [
    { label: "Supplier", value: displayOrDash(fabric.supplier_name) },
    { label: "Color", value: displayOrDash(fabric.color) },
    { label: "Composition", value: displayOrDash(fabric.composition) },
    {
      label: "Weight",
      value: fabric.weight_gsm != null ? `${fabric.weight_gsm} gsm` : "-",
    },
    {
      label: "Width",
      value: fabric.width_cm != null ? `${fabric.width_cm} cm` : "-",
    },
    { label: "Client", value: displayOrDash(fabric.client_name) },
    { label: "Source note", value: displayOrDash(fabric.source_note) },
    { label: "Created", value: formatCreatedAt(fabric.created_at) },
    { label: "Created by", value: displayOrDash(fabric.created_by) },
  ];

  return (
    <div className="custom-fabric-filing-print min-h-screen bg-white p-6 text-slate-900 print:p-0">
      <style dangerouslySetInnerHTML={{ __html: CUSTOM_FABRIC_FILING_PRINT_CSS }} />

      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div>
          <Link
            href="/fabric-specification"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            Back to Fabric Specification
          </Link>
          <p className="mt-1 text-xs text-slate-500">
            A4 filing card - empty 5x5 cm square (top right) for a physical swatch
          </p>
        </div>
        <Button type="button" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Print this sheet
        </Button>
      </div>

      <div className="print-a4-sheet">
        <div className="filing-header">
          <div className="filing-title-block">
            <p className="filing-eyebrow">Custom / one-off fabric</p>
            <h1 className="filing-fabric-number">{fabric.fabric_number}</h1>
            <p className="filing-description">{displayOrDash(fabric.description)}</p>
          </div>
          <div className="swatch-square" aria-label="Attach swatch 5 by 5 centimeters">
            <span className="swatch-square-label">
              Attach
              <br />
              swatch
              <br />
              5 x 5 cm
            </span>
          </div>
        </div>

        <table className="filing-fields">
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="filing-footer">
          Cut a fabric sample and attach it in the empty square, then file this page with
          the fabric record.
        </p>
      </div>
    </div>
  );
}
