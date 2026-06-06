"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  labelRollHeightCss,
  labelRollHeightMm,
  labelRollSizeLabel,
  labelRollSizeCss,
  labelRollWidthCss,
  labelRollWidthMm,
} from "@/lib/production/label-print-config";
import { qrImageUrl } from "@/lib/production/qr-labels";
import type { PrintablePoSheet, PrintableStickerLabel } from "@/lib/production/qr-labels";

type StickersApiResponse = {
  order: {
    id: string;
    so_number: string;
    client_code: string;
    client_name: string;
  };
  labels: Array<PrintableStickerLabel & { qr_url: string }>;
  po_sheets: Array<
    PrintablePoSheet & {
      labels: Array<PrintableStickerLabel & { qr_url: string }>;
    }
  >;
};

export type StickerSheetMode = "fabric-cuts" | "pieces";

type StickerPrintSheetProps = {
  salesOrderId: string;
  poNumber?: string;
  poId?: string;
  sheet?: StickerSheetMode;
};

function formatWeight(weightGsm: number | null): string | null {
  if (weightGsm == null) return null;
  return `${weightGsm} gsm`;
}

export function StickerCell({ label }: { label: PrintableStickerLabel & { qr_url?: string } }) {
  const qrUrl = label.qr_url ?? qrImageUrl(label.qr_payload, 112);
  const weight = formatWeight(label.weight_gsm);

  return (
    <div
      className="sticker-cell flex flex-col items-center justify-center border border-dashed border-slate-300 bg-white p-1 text-center"
      style={{ width: `${labelRollWidthMm()}mm`, height: `${labelRollHeightMm()}mm` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qrUrl} alt="" width={56} height={56} className="h-14 w-14 shrink-0" />
      <p className="mt-0.5 font-mono text-[9px] font-bold leading-tight text-slate-900">{label.client_code}</p>
      <p className="font-mono text-[8px] font-semibold leading-tight text-indigo-800">{label.production_code}</p>
      <p className="mt-0.5 truncate text-[7px] font-medium leading-tight text-slate-700">
        {label.fabric_brand} · {label.fabric_number}
      </p>
      {(label.composition || weight) && (
        <p className="line-clamp-2 text-[6.5px] leading-tight text-slate-500">
          {[label.composition, weight].filter(Boolean).join(" · ")}
        </p>
      )}
      <p className="truncate text-[6.5px] leading-tight text-slate-400">
        {label.production_code === label.fabric_cut_code ? `Cut · ${label.piece_name}` : label.piece_name}
      </p>
    </div>
  );
}

const SHEET_COPY: Record<
  StickerSheetMode,
  { title: string; hint: string; otherLabel: string; otherSheet: StickerSheetMode }
> = {
  "fabric-cuts": {
    title: "Fabric cut stickers (receive / wash)",
    hint: `One ${labelRollSizeLabel()} roll label per fabric line — stick on the roll when fabric arrives. Receiving & washing scan this QR.`,
    otherLabel: "Production stickers",
    otherSheet: "pieces",
  },
  pieces: {
    title: "Piece stickers (cutting / sewing)",
    hint: `One ${labelRollSizeLabel()} roll label per garment piece — after prep, stick on jacket, trouser, etc. (e.g. suit = 2 stickers).`,
    otherLabel: "Print fabric cut stickers (receive)",
    otherSheet: "fabric-cuts",
  },
};

export function StickerPrintSheet({
  salesOrderId,
  poNumber,
  poId,
  sheet = "pieces",
}: StickerPrintSheetProps) {
  const [data, setData] = useState<StickersApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (poNumber) params.set("po", poNumber);
      if (poId) params.set("po_id", poId);
      params.set("sheet", sheet);
      const qs = params.toString();
      const res = await fetch(`/api/sales-orders/${salesOrderId}/stickers${qs ? `?${qs}` : ""}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load stickers");
      setData(json as StickersApiResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stickers");
    } finally {
      setLoading(false);
    }
  }, [salesOrderId, poNumber, poId, sheet]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-slate-500">Loading printable stickers…</p>;
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error ?? "Failed to load stickers"}
      </div>
    );
  }

  const sheets =
    data.po_sheets.length > 0 && (poNumber || poId)
      ? data.po_sheets
      : data.po_sheets.length > 0
        ? data.po_sheets
        : [
            {
              po_number: data.order.so_number,
              supplier_name: "All fabrics",
              client_code: data.order.client_code,
              so_number: data.order.so_number,
              client_reference: data.order.client_code,
              labels: data.labels,
            },
          ];

  const copy = SHEET_COPY[sheet];
  const otherHref = `/orders/${salesOrderId}/stickers?sheet=${copy.otherSheet}${poNumber ? `&po=${encodeURIComponent(poNumber)}` : ""}`;

  return (
    <div>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{copy.title}</p>
          <p className="mt-1 text-sm text-slate-600">
            {data.order.so_number} · {data.order.client_name} ·{" "}
            <span className="font-mono text-indigo-700">{data.order.client_code}</span>
          </p>
          <p className="mt-1 text-sm text-slate-500">{copy.hint}</p>
          <p className="mt-1 text-xs text-slate-400">
            Roll printer ({labelRollSizeLabel()}) — one label per feed. In LabelLife or the AIMO driver, set media to{" "}
            {labelRollSizeLabel()} before printing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Print roll labels
          </Button>
          <Link href={otherHref}>
            <Button variant="secondary">{copy.otherLabel}</Button>
          </Link>
          <Link href={`/orders/${salesOrderId}`}>
            <Button variant="secondary">View order</Button>
          </Link>
        </div>
      </div>

      {data.po_sheets.length > 1 && !poNumber && !poId && (
        <div className="no-print mb-6 flex flex-wrap gap-2">
          {data.po_sheets.map((sheet) => (
            <Link key={sheet.po_number} href={`/orders/${salesOrderId}/stickers?po=${encodeURIComponent(sheet.po_number)}`}>
              <Button variant="secondary" size="sm">
                {sheet.po_number} — {sheet.supplier_name}
              </Button>
            </Link>
          ))}
        </div>
      )}

      {sheets.map((sheet) => (
        <section key={sheet.po_number} className="print-sheet mb-10 break-after-page">
          <div className="no-print mb-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <p className="font-semibold text-slate-900">
              {sheet.po_number} — {sheet.supplier_name}
            </p>
            <p className="text-slate-600">
              {sheet.so_number} · Client {sheet.client_code} · {sheet.labels.length} sticker
              {sheet.labels.length !== 1 ? "s" : ""}
            </p>
          </div>

          <div className="print-header mb-4 hidden text-sm print:block">
            <p className="font-bold">{sheet.po_number} — {sheet.supplier_name}</p>
            <p>
              {sheet.so_number} · {sheet.client_code}
            </p>
          </div>

          <div className="sticker-roll flex flex-wrap gap-3 print:block print:gap-0">
            {sheet.labels.map((label) => (
              <div
                key={`${label.sticker_code}-${label.production_code}`}
                className="sticker-page print:break-after-page"
              >
                <StickerCell label={label} />
              </div>
            ))}
          </div>
        </section>
      ))}

      <style jsx global>{`
        @media print {
          @page {
            size: ${labelRollSizeCss()};
            margin: 0;
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
            overflow: visible !important;
          }
          body {
            background: white !important;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          .print-sheet {
            position: static !important;
            width: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
          }
          .sticker-roll {
            display: block !important;
          }
          .sticker-page {
            width: ${labelRollWidthCss()} !important;
            height: ${labelRollHeightCss()} !important;
            max-width: ${labelRollWidthCss()} !important;
            max-height: ${labelRollHeightCss()} !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            page-break-after: always !important;
            break-after: page !important;
          }
          .sticker-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .sticker-cell {
            width: ${labelRollWidthCss()} !important;
            height: ${labelRollHeightCss()} !important;
            max-width: ${labelRollWidthCss()} !important;
            max-height: ${labelRollHeightCss()} !important;
            box-sizing: border-box;
            border: none !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>
    </div>
  );
}
