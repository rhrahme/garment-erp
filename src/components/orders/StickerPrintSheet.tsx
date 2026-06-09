"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StickerCell } from "@/components/orders/StickerCell";
import { StickerPrintPreviewModal } from "@/components/orders/StickerPrintPreviewModal";
import { useMarkFabricLinesPrinted } from "@/components/orders/useMarkFabricLinesPrinted";
import { useStickerPrint } from "@/hooks/useStickerPrint";
import { PRINTING_FREE } from "@/lib/sales-orders/print-mode";
import { labelPdfMediaMmLabel, labelRollSizeLabel } from "@/lib/production/label-print-config";
import {
  lineIdsForStickerSelection,
  stickerCodesForUnprintedLines,
  type StickerPreviewItem,
} from "@/lib/production/sticker-print-selection";
import { stickerPrintStyles } from "@/lib/production/sticker-print-styles";
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
  unprinted_line_ids?: {
    a4: string[];
    prep_stickers: string[];
    prod_stickers: string[];
  };
};

export type StickerSheetMode = "fabric-cuts" | "pieces";

type StickerPrintSheetProps = {
  salesOrderId: string;
  poNumber?: string;
  poId?: string;
  sheet?: StickerSheetMode;
};

const STICKER_SHEET_TABS: Array<{
  id: StickerSheetMode;
  label: string;
  subtitle: string;
}> = [
  {
    id: "fabric-cuts",
    label: "Preparation",
    subtitle: "receive / wash",
  },
  {
    id: "pieces",
    label: "Production",
    subtitle: "cutting / sewing",
  },
];

const SHEET_COPY: Record<StickerSheetMode, { title: string; hint: string }> = {
  "fabric-cuts": {
    title: "Fabric cut stickers (receive / wash)",
    hint: `One ${labelRollSizeLabel()} roll label per fabric line — stick on the roll when fabric arrives. Receiving & washing scan this QR.${
      PRINTING_FREE ? " Testing: all lines, reprint anytime." : " New lines only."
    }`,
  },
  pieces: {
    title: "Piece stickers (cutting / sewing)",
    hint: `One ${labelRollSizeLabel()} roll label per garment piece — after prep, stick on jacket, trouser, etc. (e.g. suit = 2 stickers).${
      PRINTING_FREE ? " Testing: all lines, reprint anytime." : " New lines only."
    }`,
  },
};

function printedStorageKey(orderId: string, sheet: StickerSheetMode): string {
  return `sticker-printed:${orderId}:${sheet}`;
}

function readPrintedSheets(orderId: string): Set<StickerSheetMode> {
  const printed = new Set<StickerSheetMode>();
  for (const tab of STICKER_SHEET_TABS) {
    if (typeof window !== "undefined" && sessionStorage.getItem(printedStorageKey(orderId, tab.id))) {
      printed.add(tab.id);
    }
  }
  return printed;
}

function stickerSheetHref(
  orderId: string,
  sheetMode: StickerSheetMode,
  poNumber?: string,
  poId?: string
): string {
  const params = new URLSearchParams({ sheet: sheetMode });
  if (poNumber) params.set("po", poNumber);
  if (poId) params.set("po_id", poId);
  return `/orders/${orderId}/stickers?${params.toString()}`;
}

export function StickerPrintSheet({
  salesOrderId,
  poNumber,
  poId,
  sheet = "pieces",
}: StickerPrintSheetProps) {
  const [data, setData] = useState<StickersApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printedSheets, setPrintedSheets] = useState<Set<StickerSheetMode>>(() => new Set());
  const [previewOpen, setPreviewOpen] = useState(false);
  const { printing, requestPrint } = useStickerPrint();
  const { printWithMark } = useMarkFabricLinesPrinted(salesOrderId);

  useEffect(() => {
    setPrintedSheets(readPrintedSheets(salesOrderId));
  }, [salesOrderId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (poNumber) params.set("po", poNumber);
      if (poId) params.set("po_id", poId);
      params.set("sheet", sheet);
      const qs = params.toString();
      const res = await fetch(`/api/sales-orders/${salesOrderId}/stickers${qs ? `?${qs}` : ""}`, {
        cache: "no-store",
      });
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

  const stickerRole = sheet === "fabric-cuts" ? "prep" : "prod";

  const sheets = useMemo(() => {
    if (!data) return [] as Array<
      PrintablePoSheet & {
        labels: Array<PrintableStickerLabel & { qr_url: string }>;
      }
    >;
    if (data.po_sheets.length > 0 && (poNumber || poId)) return data.po_sheets;
    if (data.po_sheets.length > 0) return data.po_sheets;
    return [
      {
        po_number: data.order.so_number,
        supplier_name: "All fabrics",
        client_code: data.order.client_code,
        so_number: data.order.so_number,
        client_reference: data.order.client_code,
        labels: data.labels,
      },
    ];
  }, [data, poNumber, poId]);

  const previewItems = useMemo<StickerPreviewItem[]>(
    () =>
      sheets.flatMap((poSheet) =>
        poSheet.labels.map((label) => ({
          label,
          role: stickerRole,
        }))
      ),
    [sheets, stickerRole]
  );

  const defaultSelectedCodes = useMemo(() => {
    if (!data?.unprinted_line_ids) return undefined;
    return stickerCodesForUnprintedLines(previewItems, {
      prep_stickers: data.unprinted_line_ids.prep_stickers,
      prod_stickers: data.unprinted_line_ids.prod_stickers,
    });
  }, [data, previewItems]);

  const handlePrintSelected = useCallback(
    (selectedCodes: string[]) => {
      setPreviewOpen(false);
      const selected = new Set(selectedCodes);
      const printKind = sheet === "fabric-cuts" ? "prep_stickers" : "prod_stickers";
      const lineIds = lineIdsForStickerSelection(previewItems, selected, printKind);

      printWithMark(
        [{ kind: printKind, lineIds }],
        () => {
          if (!PRINTING_FREE) {
            sessionStorage.setItem(printedStorageKey(salesOrderId, sheet), "1");
            setPrintedSheets(readPrintedSheets(salesOrderId));
          }
        },
        (onAfterPrint) =>
          requestPrint(
            {
              orderId: salesOrderId,
              sheet,
              po: poNumber,
              poId,
              codes: selectedCodes,
            },
            onAfterPrint
          )
      );
    },
    [poId, poNumber, previewItems, printWithMark, requestPrint, salesOrderId, sheet]
  );

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

  const copy = SHEET_COPY[sheet];
  const labelCount = sheets.reduce((sum, poSheet) => sum + poSheet.labels.length, 0);
  const hasLabelsToPrint = labelCount > 0;

  return (
    <div>
      <div className="no-print mb-4">
        <div className="inline-flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {STICKER_SHEET_TABS.map((tab) => {
            const active = sheet === tab.id;
            const printed = printedSheets.has(tab.id);
            return (
              <Link
                key={tab.id}
                href={stickerSheetHref(salesOrderId, tab.id, poNumber, poId)}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-emerald-600 text-white shadow-sm"
                    : printed
                      ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-300"
                      : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  {printed ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
                  <span className="font-semibold">{tab.label}</span>
                </span>
                <span
                  className={`ml-2 text-xs ${
                    active ? "text-emerald-100" : printed ? "text-emerald-600" : "text-slate-400"
                  }`}
                >
                  {tab.subtitle}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{copy.title}</p>
          <p className="mt-1 text-sm text-slate-600">
            {data.order.so_number} · {data.order.client_name} ·{" "}
            <span className="font-mono text-indigo-700">{data.order.client_code}</span>
          </p>
          <p className="mt-1 text-sm text-slate-500">{copy.hint}</p>
          <p className="mt-1 text-xs text-slate-400">
            Roll printer ({labelRollSizeLabel()} physical) — one label per feed. In LabelLife or the AIMO driver, set media to{" "}
            {labelPdfMediaMmLabel()} before printing. Labels print from a server PDF (no browser date/URL headers).
            {!hasLabelsToPrint ? " No fabric lines on this order." : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setPreviewOpen(true)} disabled={!hasLabelsToPrint || printing}>
            <Printer className="mr-2 h-4 w-4" />
            {printing ? "Preparing PDF…" : "Print roll labels"}
          </Button>
          <Link href={`/orders/${salesOrderId}`}>
            <Button variant="secondary">View order</Button>
          </Link>
        </div>
      </div>

      {data.po_sheets.length > 1 && !poNumber && !poId && (
        <div className="no-print mb-6 flex flex-wrap gap-2">
          {data.po_sheets.map((poSheet) => (
            <Link key={poSheet.po_number} href={`/orders/${salesOrderId}/stickers?po=${encodeURIComponent(poSheet.po_number)}`}>
              <Button variant="secondary" size="sm">
                {poSheet.po_number} — {poSheet.supplier_name}
              </Button>
            </Link>
          ))}
        </div>
      )}

      {sheets.map((poSheet) => (
        <section key={poSheet.po_number} className="print-sheet mb-10 break-after-page">
          <div className="no-print mb-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <p className="font-semibold text-slate-900">
              {poSheet.po_number} — {poSheet.supplier_name}
            </p>
            <p className="text-slate-600">
              {poSheet.so_number} · Client {poSheet.client_code} · {poSheet.labels.length} sticker
              {poSheet.labels.length !== 1 ? "s" : ""}
            </p>
          </div>

          <div className="sticker-print-zone">
            <div className="sticker-roll flex flex-wrap gap-3 print:block print:gap-0">
              {poSheet.labels.map((label) => (
                <div
                  key={`${label.sticker_code}-${label.production_code}`}
                  className="sticker-page print:break-after-page"
                >
                  <StickerCell label={label} role={stickerRole} />
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}

      <StickerPrintPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onPrint={handlePrintSelected}
        items={previewItems}
        defaultSelectedCodes={defaultSelectedCodes}
        title={copy.title}
        printing={printing}
      />

      <style dangerouslySetInnerHTML={{ __html: stickerPrintStyles() }} />
    </div>
  );
}
