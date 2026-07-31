import type { TumMetadata, TumPiece } from "@/lib/types/pattern-library";
import { extractTudThumbnail } from "@/lib/pattern-library/tud-parser";

/**
 * TUKAmrk .tum parser - ASCII header only (same family as .tud).
 *
 * File layout: plain-text header (`@ Begin` ... `@ End`), embedded JFIF thumbnail,
 * then binary marker geometry (not decoded). Key records:
 *   !   <marker path>
 *   /F  <source .tud path>
 *   -K  StyleCaption  <name>
 *   -D  <length_cm> <width_cm> <efficiency_pct> [<perimeter_cm>]
 *   -Q  <size> <garment_qty> ...
 *   -P  "<piece>" "<code>" ""
 *   -E  <piece> <size> <n> <area_m2> <perimeter_cm>
 *   -G  <fabric>
 */

const HEADER_SCAN_LIMIT = 512 * 1024;

export interface ParsedTumFile {
  metadata: TumMetadata;
  thumbnail: Buffer | null;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : null;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Parses a .tum buffer into marker metrics + thumbnail.
 * Returns null when the buffer does not look like a TUKAmrk header.
 */
export function parseTumFile(buffer: Buffer): ParsedTumFile | null {
  const headerText = buffer.subarray(0, Math.min(buffer.length, HEADER_SCAN_LIMIT)).toString("latin1");
  const begin = headerText.indexOf("@ Begin");
  if (begin < 0) return null;
  const end = headerText.indexOf("@ End", begin);
  const header = headerText.slice(begin, end > begin ? end : undefined);

  // Marker files usually carry -Z MarkerCaption and/or a -D metrics line.
  if (!/-D\s/.test(header) && !/-Z\s+MarkerCaption/i.test(header)) {
    // Still allow if it looks like a marker path record.
    if (!/^!\s+/m.test(header)) return null;
  }

  let styleCaption: string | null = null;
  let sourcePath: string | null = null;
  let markerPath: string | null = null;
  let lengthCm: number | null = null;
  let widthCm: number | null = null;
  let efficiencyPct: number | null = null;
  let perimeterCm: number | null = null;
  let size: string | null = null;
  let garmentQty: number | null = null;
  const pieces: TumPiece[] = [];
  let currentPiece: TumPiece | null = null;

  for (const rawLine of header.split(/\r?\n/)) {
    const line = rawLine.replace(/\0/g, "").trim();
    if (!line) continue;

    if (line.startsWith("!")) {
      const path = cleanText(line.slice(1));
      if (path) markerPath = path;
      continue;
    }

    const tag = line.slice(0, 2);
    const rest = line.slice(2).trim();

    if (tag === "/F") {
      sourcePath = rest || null;
      continue;
    }
    if (tag === "-K") {
      const match = rest.match(/^StyleCaption\s+(.*)$/);
      if (match) styleCaption = cleanText(match[1] ?? "") || null;
      continue;
    }
    if (tag === "-D") {
      // -D <length_cm> <width_cm> <efficiency_pct> [<perimeter_cm>]
      const parts = rest.split(/\s+/);
      lengthCm = toNumber(parts[0]);
      widthCm = toNumber(parts[1]);
      efficiencyPct = toNumber(parts[2]);
      perimeterCm = toNumber(parts[3]);
      continue;
    }
    if (tag === "-Q") {
      // Marker size run: -Q <size> <garment_qty> ...
      const parts = rest.split(/\s+/);
      if (parts[0]) size = parts[0];
      const qty = toNumber(parts[1]);
      if (qty !== null) garmentQty = qty;
      continue;
    }
    if (tag === "-P") {
      const quoted = [...rest.matchAll(/"([^"]*)"/g)].map((m) => m[1] ?? "");
      const name = (quoted[0] ?? "").trim();
      const code = (quoted[1] ?? "").trim() || null;
      if (name) {
        currentPiece = {
          name,
          code,
          cut_quantity: null,
          fabric: null,
          area_m2: null,
          perimeter_cm: null,
        };
        pieces.push(currentPiece);
      }
      continue;
    }
    if (tag === "-E") {
      // -E <piece> <size> <n> <area_m2> <perimeter_cm>
      const parts = rest.split(/\s+/);
      const area = toNumber(parts[3]);
      const perimeter = toNumber(parts[4]);
      const count = toNumber(parts[2]);
      if (!size && parts[1]) size = parts[1];
      const target =
        currentPiece &&
        (currentPiece.name === parts[0] ||
          currentPiece.name.replace(/[\s/\\]+/g, "_") === parts[0] ||
          currentPiece.name.replace(/\s+/g, "_") === parts[0])
          ? currentPiece
          : pieces.find(
              (piece) =>
                piece.name === parts[0] ||
                piece.name.replace(/[\s/\\]+/g, "_") === parts[0] ||
                piece.name.replace(/\s+/g, "_") === parts[0]
            ) ?? currentPiece;
      if (target) {
        if (count !== null) target.cut_quantity = count;
        if (area !== null) target.area_m2 = area;
        if (perimeter !== null) target.perimeter_cm = perimeter;
      }
      continue;
    }
    if (tag === "-G") {
      const fabric = rest.split(/\s+/)[0];
      if (currentPiece && fabric) currentPiece.fabric = fabric;
      continue;
    }
  }

  if (
    lengthCm === null &&
    widthCm === null &&
    efficiencyPct === null &&
    pieces.length === 0 &&
    !styleCaption
  ) {
    return null;
  }

  const totalCutPieces = pieces.reduce<number | null>((sum, piece) => {
    if (piece.cut_quantity === null) return sum;
    return (sum ?? 0) + piece.cut_quantity;
  }, null);

  const metadata: TumMetadata = {
    style_caption: styleCaption,
    source_path: sourcePath,
    marker_path: markerPath,
    length_cm: lengthCm !== null ? round(lengthCm, 3) : null,
    width_cm: widthCm !== null ? round(widthCm, 3) : null,
    efficiency_pct: efficiencyPct !== null ? round(efficiencyPct, 3) : null,
    perimeter_cm: perimeterCm !== null ? round(perimeterCm, 3) : null,
    size,
    garment_qty: garmentQty,
    pieces,
    total_cut_pieces: totalCutPieces,
  };

  return { metadata, thumbnail: extractTudThumbnail(buffer) };
}
