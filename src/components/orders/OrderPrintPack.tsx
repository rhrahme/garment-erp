"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StickerCell } from "@/components/orders/StickerCell";
import { useMarkFabricLinesPrinted } from "@/components/orders/useMarkFabricLinesPrinted";
import { PRINTING_FREE } from "@/lib/sales-orders/print-mode";
import { labelRollSizeLabel } from "@/lib/production/label-print-config";
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

      <div className="print-header mb-3 hidden text-sm print:block">
        <p className="font-bold">{title}</p>
        <p>{hint}</p>
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
  const { printWithMark } = useMarkFabricLinesPrinted(salesOrderId);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales-orders/${salesOrderId}/stickers?sheet=print-pack`);
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

  const printIds = data.unprinted_line_ids;
  const prepLineIds = printIds?.prep_stickers ?? [];
  const prodLineIds = printIds?.prod_stickers ?? [];
  const stickerCount = data.fabric_cut_labels.length + data.cutting_piece_labels.length;
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
                {PRINTING_FREE ? " (testing: all lines)." : " (new lines only)."}{" "}
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
            onClick={() =>
              printWithMark([
                { kind: "prep_stickers", lineIds: prepLineIds },
                { kind: "prod_stickers", lineIds: prodLineIds },
              ])
            }
            disabled={!hasStickersToPrint}
          >
            <Printer className="mr-2 h-4 w-4" />
            Print sticker rolls
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

      <style dangerouslySetInnerHTML={{ __html: stickerPrintStyles() }} />
    </div>
  );
}
