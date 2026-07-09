# Fabric-cut / production sticker print fix (D550 thermal roll)

The "Print stickers" page (Production Orders → **Preparation** = receive/wash, and **Production** = cutting/sewing) renders 5×10 cm QR labels to a **D550 / LabelLife** thermal roll printer. For weeks the on-screen preview looked correct but the physical print was wrong (tiny / mispositioned QR, no text, then rotated + clipped). This doc captures the root causes and the fix so we never re-litigate it.

## Problem

- Preview (React) looked right; the physical label did not.
- Symptoms evolved as each layer was fixed: first a tiny QR in a corner with no text, then a full-size but **90° rotated and clipped** label (only the QR + first header line printed, bottom ~60% blank).

## Root causes & fixes (in the order they were found)

| # | Root cause | Fix | Commit |
|---|------------|-----|--------|
| a | Chrome's **PDF viewer defaulted to "Fit to printable area"**, shrinking the label and ignoring `/PrintScaling None`. | Stopped printing a PDF. Print now opens an **HTML popup embedding the server bilevel PNG(s)** with `@page { size: 51mm 102mm; margin: 0 }`, so the browser maps the raster 1:1. | `62c77eb` |
| b | **Auto-print never fired.** The boot script waited on `window.onload`, which does **not** re-fire after `document.open()/write()/close()` into an already-loaded popup. | Boot script runs immediately, waits for every label image via `img.decode()` (with `onload` fallback + 3s safety timeout) then calls `window.print()`. Added a visible **"Print labels"** manual fallback button (`window.__printStickerLabels`). | `a79ce96` |
| c | **The D550 driver applies a fixed 90° CLOCKWISE rotation** to every page. An upright portrait 51×102 raster therefore printed sideways, laying the 102 mm-tall content across the 51 mm width → everything after the QR was clipped. Verified by reproducing the physical photo pixel-for-pixel. | Emit printer-match rasters, PDF pages and the `@page` as **landscape 102×51, with the readable portrait design pre-rotated 90° CCW** (lossless 90° pixel remap → QR stays crisp). The driver's own +90° CW cancels it, landing an upright, complete 51×102 portrait label. | `0d67c8e` |
| d | UI polish requested once it printed correctly. | QR **~30% smaller** (38 → 27 mm); text fonts **~17% smaller** (hierarchy kept, cut length stays largest); cut length + label count **merged onto one line** ("3 m   2 labels", meters larger). | `bfbdcb2` |

## Single source of truth

Both tabs (**Preparation** = `prep`/`fabric-cuts` and **Production** = `prod`/`pieces`) use the **same** render and delivery path — only the `role`/`sheet` differs (header text `PREPARATION` vs `PRODUCTION`, and which fabric lines are selected). All four fixes above apply to **both** automatically:

- `StickerPrintSheet.tsx` (both tabs) → `StickerPrintPreviewModal.tsx` → `useStickerPrint().requestPrint` → `/api/sales-orders/[id]/stickers/png` → `generateStickerRollPngs` → `renderStickerPagePng` → `buildStickerPageSvg` (`render-sticker-raster.ts`).
- Print mode defaults to `printer-match` (landscape pre-rotation) via `readLabelRotation()` → `label-printer-settings.ts`.
- Layout constants shared in `label-print-config.ts` (`LABEL_STICKER_QR_SIZE_MM`, `LABEL_STICKER_FONT_MM`, gaps).
- The preview card renders the **exact emitted bitmap** (de-rotated 90° for on-screen viewing only), so **preview == printed bytes**.

_Confirmed on the real D550: both a Preparation label and a Production label (SO-2026-0119) print upright, complete, and correctly scaled._

## Invariants (do not regress)

- **preview == printed bytes** — one server raster feeds preview, print, PDF and PNG download.
- **`@page` margin 0** and **no browser headers/footers** (date/URL/page number).
- **Landscape 102×51 emitted raster, pre-rotated 90° CCW** to cancel the D550's fixed 90° CW turn.
- **Auto-print fires** after image decode, with the **manual "Print labels"** fallback button.
- **Scale 100%** (never Fit to page).

## Required D550 one-time driver settings (Windows print PC)

Control Panel → Devices and Printers → **D550** → Printing preferences:

- **Stock / Media size = 51 × 102 mm (2" × 4")** — matches the physical label.
- **Scale / Zoom = 100% (None)** — NOT "Fit to page" / "Fit to printable area".
- **Do NOT change the driver Orientation.** The app pre-rotates on purpose so the driver's built-in 90° turn cancels out; changing orientation would double-rotate.

In the browser print dialog: printer **D550 / LabelLife**, Margins **None**, Scale **Actual size (100%)**, and turn **OFF** "Headers and footers".

## Reprinting / after a deploy

- Labels can be reprinted anytime from either tab (nothing is consumed).
- **After any deploy of a sticker change, hard-refresh** the print PC (Ctrl/Cmd+Shift+R) so the new client bundle + `@page`/raster orientation take effect.
- If a label ever prints upside-down (180°), use the in-app rotation control's "flipped" mode — no driver change needed.

## Regenerating proofs

Reproducible scripts under `scripts/` (output PNG/PDF land in the repo root and are throwaway — not committed):

- `node scripts/proof-so-0119-stickers.mjs` — Preparation label, emitted landscape bytes + physical (post-driver-rotation) appearance.
- `node scripts/proof-so-0119-production.mjs` — Production/cutting label, same outputs.
- `node scripts/sticker-rotation-repro.mjs` — reproduces the driver's 90° CW turn and proves the counter-rotation round-trips to upright.

## Next steps (tomorrow)

- **End-to-end QR scan test.** Confirm which device scans (phone / handheld scanner on the floor), and that a successful scan opens the right screen and lets the operator act:
  - Preparation QR → open the fabric line → mark **washing / ironing** done.
  - Production QR → open the piece → advance cutting / sewing.
- Verify the smaller (27 mm) QR still scans reliably on the actual scanner in shop lighting; bump size slightly if any misreads.
