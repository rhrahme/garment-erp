"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { OutfitSketch } from "@/components/marketing/OutfitSketch";
import {
  SUITS_YOUNG,
  SUITS_YOUNG_SUBTITLE,
  SUITS_YOUNG_TITLE,
  type LookbookFabric,
} from "@/lib/marketing/suits-young";

/* Print recipe per KNOWLEDGE.md: @page A4 portrait, pt fonts,
   Helvetica/Arial, no transform/zoom, no max-w wrappers. One suit per page. */
const PRINT_CSS = `
@page { size: A4 portrait; margin: 14mm; }
.lookbook {
  font-family: Helvetica, Arial, sans-serif;
  color: #17202b;
}
.lookbook .lb-cover-title { font-size: 26pt; font-weight: 700; letter-spacing: 1pt; }
.lookbook .lb-cover-sub { font-size: 11pt; color: #5c6672; margin-top: 3mm; }
.lookbook .lb-page { page-break-after: always; padding-top: 4mm; }
.lookbook .lb-page:last-child { page-break-after: auto; }
.lookbook .lb-order { font-size: 10pt; letter-spacing: 2pt; text-transform: uppercase; color: #8a4b57; font-weight: 700; }
.lookbook .lb-title { font-size: 20pt; font-weight: 700; margin-top: 1mm; }
.lookbook .lb-headline { font-size: 10.5pt; line-height: 1.5; color: #46505c; margin-top: 2.5mm; }
.lookbook .lb-cols { display: flex; gap: 8mm; margin-top: 6mm; align-items: flex-start; }
.lookbook .lb-left { width: 58%; }
.lookbook .lb-right { width: 42%; }
.lookbook .lb-swatch { width: 100%; height: 96mm; object-fit: cover; border-radius: 3pt; border: 1pt solid #d8dde3; display: block; }
.lookbook .lb-swatch-note { font-size: 8.5pt; color: #7a838e; margin-top: 1.5mm; font-style: italic; }
.lookbook .lb-swatch-pending {
  width: 100%; height: 96mm; border-radius: 3pt; border: 1pt dashed #b6bec7;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  font-size: 9.5pt; color: #7a838e; gap: 2mm;
}
.lookbook .lb-swatch-pending .chip { width: 26mm; height: 26mm; border-radius: 3pt; border: 1pt solid rgba(0,0,0,0.15); }
.lookbook .lb-spec { width: 100%; border-collapse: collapse; margin-top: 4mm; }
.lookbook .lb-spec td { border: 0.6pt solid #d8dde3; padding: 2mm 3mm; font-size: 9.5pt; }
.lookbook .lb-spec td:first-child { width: 30%; font-weight: 700; color: #46505c; background: #f4f6f8; }
.lookbook .lb-similar { margin-top: 4mm; border: 0.8pt solid #d8dde3; border-left: 3pt solid #8a4b57; border-radius: 2pt; padding: 3mm 4mm; }
.lookbook .lb-similar .h { font-size: 8.5pt; letter-spacing: 1.5pt; text-transform: uppercase; color: #8a4b57; font-weight: 700; }
.lookbook .lb-similar .b { font-size: 10pt; margin-top: 1.5mm; }
.lookbook .lb-similar .c { font-size: 9pt; color: #5c6672; margin-top: 0.5mm; }
.lookbook .lb-pair-h { font-size: 8.5pt; letter-spacing: 1.5pt; text-transform: uppercase; color: #8a4b57; font-weight: 700; margin-bottom: 3mm; }
.lookbook .lb-pair { display: flex; gap: 4mm; align-items: center; border: 0.6pt solid #e2e6ea; border-radius: 3pt; padding: 3mm; margin-bottom: 3.5mm; page-break-inside: avoid; }
.lookbook .lb-pair svg { width: 24mm; height: 38mm; flex: none; }
.lookbook .lb-pair .t { font-size: 10pt; line-height: 1.45; }
.lookbook .lb-footer { font-size: 8pt; color: #9aa2ab; margin-top: 6mm; text-align: right; }
@media print {
  .screen-only { display: none !important; }
}
`;

function FabricSpecTable({ fabric }: { fabric: LookbookFabric }) {
  return (
    <table className="lb-spec">
      <tbody>
        <tr>
          <td>Supplier</td>
          <td>{fabric.supplier}</td>
        </tr>
        <tr>
          <td>Collection</td>
          <td>{fabric.collection ?? "-"}</td>
        </tr>
        <tr>
          <td>Article</td>
          <td>{fabric.article}</td>
        </tr>
        <tr>
          <td>Composition</td>
          <td>{fabric.composition ?? "-"}</td>
        </tr>
        {fabric.weight_gsm ? (
          <tr>
            <td>Weight</td>
            <td>{fabric.weight_gsm} g/m2</td>
          </tr>
        ) : null}
        {fabric.width_cm ? (
          <tr>
            <td>Width</td>
            <td>{fabric.width_cm} cm</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

export function SuitsYoungLookbook({ showPrintButton }: { showPrintButton?: boolean }) {
  return (
    <div className="lookbook">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      {showPrintButton ? (
        <div className="screen-only mb-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">
            Print A4 portrait, scale 100%. One suit per page, cover page first.
          </p>
          <Button onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" />
            Print / Save PDF
          </Button>
        </div>
      ) : null}

      <div className="lb-page">
        <p className="lb-order">Hagan - Marketing</p>
        <h1 className="lb-cover-title">{SUITS_YOUNG_TITLE}</h1>
        <p className="lb-cover-sub">{SUITS_YOUNG_SUBTITLE}</p>
        <div className="mt-8 grid grid-cols-3 gap-4">
          {SUITS_YOUNG.map((suit) => (
            <div key={suit.id} className="rounded border border-slate-200 p-3">
              <p className="lb-order">{suit.order_label}</p>
              <p className="text-sm font-semibold">{suit.color_name}</p>
              <p className="mt-1 text-xs text-slate-500">
                {suit.fabric.supplier} {suit.fabric.article}
              </p>
            </div>
          ))}
        </div>
        <p className="lb-footer">Prepared by Hagan - {new Date().toLocaleDateString()}</p>
      </div>

      {SUITS_YOUNG.map((suit) => (
        <section key={suit.id} className="lb-page">
          <p className="lb-order">{suit.order_label}</p>
          <h2 className="lb-title">{suit.color_name}</h2>
          <p className="lb-headline">{suit.headline}</p>

          <div className="lb-cols">
            <div className="lb-left">
              {suit.fabric.image_url ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="lb-swatch"
                    src={suit.fabric.image_url}
                    alt={`${suit.fabric.supplier} ${suit.fabric.article} swatch`}
                  />
                  {suit.fabric.image_note ? (
                    <p className="lb-swatch-note">{suit.fabric.image_note}</p>
                  ) : null}
                </>
              ) : (
                <div className="lb-swatch-pending">
                  <div className="chip" style={{ background: suit.suit.color }} />
                  <p>
                    {suit.fabric.supplier} {suit.fabric.article}
                  </p>
                  <p>Swatch photo pending - request from supplier bunch</p>
                </div>
              )}
              <FabricSpecTable fabric={suit.fabric} />
              <div className="lb-similar">
                <p className="h">Similar alternative</p>
                <p className="b">
                  {suit.similar.supplier} ({suit.similar.collection}) - {suit.similar.article}
                </p>
                <p className="c">{suit.similar.composition}</p>
              </div>
            </div>

            <div className="lb-right">
              <p className="lb-pair-h">How to wear it</p>
              {suit.pairings.map((pairing) => (
                <div key={pairing.label} className="lb-pair">
                  <OutfitSketch suit={suit.suit} pairing={pairing} />
                  <p className="t">{pairing.label}</p>
                </div>
              ))}
            </div>
          </div>
          <p className="lb-footer">
            {SUITS_YOUNG_TITLE} - {suit.order_label} - Prepared by Hagan
          </p>
        </section>
      ))}
    </div>
  );
}
