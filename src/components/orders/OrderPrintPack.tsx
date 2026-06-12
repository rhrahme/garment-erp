"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StickerCell } from "@/components/orders/StickerCell";
import { StickerPrintPreviewModal } from "@/components/orders/StickerPrintPreviewModal";
import { useMarkFabricLinesPrinted } from "@/components/orders/useMarkFabricLinesPrinted";
import { useStickerPrint } from "@/hooks/useStickerPrint";
import { PRINTING_FREE } from "@/lib/sales-orders/print-mode";
import { labelRollSizeLabel } from "@/lib/production/label-print-config";
import {
  lineIdsForStickerSelection,
  stickerCodesForUnprintedLines,
  type StickerPreviewItem,
} from "@/lib/production/sticker-print-selection";
import { stickerPrintStyles } from "@/lib/production/sticker-print-styles";
import type { PrintableStickerLabel } from "@/lib/production/qr-labels";

type PrintPackResponse = {
  order: {
    id: string;
    so_number: string;
    client_code: string;
    client_name: string;
  };
  fabric_cut_labels: Array<PrintableStickerLabel & { qr_url: string }>;
  cutting_piece_labels: Array<PrintableStickerLabel & { qr_url: string }>;
  has_cutting_pack: boolean;
  unprinted_line_ids?: {
    a4: string[];
    prep_stickers: string[];
    prod_stickers: string[];
  };
};

function StickerRollSection({
  title,
  hint,
  labels,
  role,
}: {
  title: string;
  hint: string;
  labels: Array<PrintableStickerLabel & { qr_url: string }>;
  role: "prep" | "prod";
}) {
  if (labels.length === 0) return null;

  return (
    <section className="print-pack-stickers mb-10 break-before-page">
      <div className="no-print mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="mt-1 text-sm text-slate-600">{hint}</p>
        <p className="mt-1 text-xs text-slate-500">
          {labels.length} sticker{labels.length === 1 ? "" : "s"} · roll printer ({labelRollSizeLabel()})
        </p>
      </div>

      <div className="sticker-print-zone">
        <div className="sticker-roll flex flex-wrap gap-3 print:block print:gap-0">
          {labels.map((label) => (
            <div
              key={`${label.sticker_code}-${label.production_code}`}
              className="sticker-page print:break-after-page"
            >
              <StickerCell label={label} role={role} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function OrderPrintPack({ salesOrderId }: { salesOrderId: string }) {
  const [data, setData] = useState<PrintPackResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const {
    printing,
    requestPrint,
    printGuideOpen,
    printGuideFilename,
    closePrintGuide,
  } = useStickerPrint();
  const { printWithMark } = useMarkFabricLinesPrinted(salesOrderId);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-orders/${salesOrderId}/stickers?sheet=print-pack`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load print pack");
      setData(json as PrintPackResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load print pack");
    } finally {
      setLoading(false);
    }
  }, [salesOrderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const previewItems = useMemo<StickerPreviewItem[]>(() => {
    if (!data) return [];
    const items: StickerPreviewItem[] = data.fabric_cut_labels.map((label) => ({
      label,
      role: "prep",
    }));
    for (const label of data.cutting_piece_labels) {
      items.push({ label, role: "prod" });
    }
    return items;
  }, [data]);

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
      const prepLineIds = lineIdsForStickerSelection(previewItems, selected, "prep_stickers");
      const prodLineIds = lineIdsForStickerSelection(previewItems, selected, "prod_stickers");

      printWithMark(
        [
          { kind: "prep_stickers", lineIds: prepLineIds },
          { kind: "prod_stickers", lineIds: prodLineIds },
        ],
        undefined,
        (onAfterPrint) =>
          requestPrint(
            {
              orderId: salesOrderId,
              sheet: "print-pack",
              codes: selectedCodes,
            },
            onAfterPrint
          )
      );
    },
    [previewItems, printWithMark, requestPrint, salesOrderId]
  );

  if (loading) {
    return <p className="text-sm text-slate-500">Loading sticker rolls for print pack…</p>;
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error ?? "Failed to load print pack"}
      </div>
    );
  }

  const stickerCount = data
    ? data.fabric_cut_labels.length + data.cutting_piece_labels.length
    : 0;
  const hasStickersToPrint = stickerCount > 0;

  return (
    <div>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Sticker rolls for this order</p>
          <p className="mt-1 text-sm text-slate-600">
            {hasStickersToPrint ? (
              <>
                Receiving pack: {data.fabric_cut_labels.length} fabric cut sticker
                {data.fabric_cut_labels.length === 1 ? "" : "s"}
                {PRINTING_FREE ? " (reprint anytime)." : " (new lines only)."}{" "}
                {data.has_cutting_pack
                  ? `Cutting pack: ${data.cutting_piece_labels.length} piece sticker${data.cutting_piece_labels.length === 1 ? "" : "s"} for multi-piece lines.`
                  : "No cutting pack — single-piece lines use the same fabric cut QR through cutting."}
              </>
            ) : (
              "No fabric lines on this order."
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setPreviewOpen(true)}
            disabled={!hasStickersToPrint || printing}
          >
            <Printer className="mr-2 h-4 w-4" />
            {printing ? "Preparing PDF…" : "Download & print sticker rolls"}
          </Button>
          <Link href={`/orders/${salesOrderId}`}>
            <Button variant="secondary">View order</Button>
          </Link>
        </div>
      </div>

      <StickerRollSection
        title="Receiving team — fabric cut stickers"
        hint="One sticker per fabric roll. Stick on the roll when fabric arrives — receiving scans this QR through wash / soak / iron."
        labels={data.fabric_cut_labels}
        role="prep"
      />

      {data.has_cutting_pack && (
        <StickerRollSection
          title="Cutting team — piece stickers"
          hint="Multi-piece garments only. Pre-print and hand to cutting — stick on jacket / trouser after iron, then scan piece QRs at Cutting."
          labels={data.cutting_piece_labels}
          role="prod"
        />
      )}

      <StickerPrintPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onPrint={handlePrintSelected}
        items={previewItems}
        defaultSelectedCodes={defaultSelectedCodes}
        title="Print pack sticker preview"
        printing={printing}
        orderId={salesOrderId}
        sheet="print-pack"
        printGuideOpen={printGuideOpen}
        printGuideFilename={printGuideFilename}
        onClosePrintGuide={closePrintGuide}
      />

      <style dangerouslySetInnerHTML={{ __html: stickerPrintStyles() }} />
    </div>
  );
}
