import type {
  TudFabricTotal,
  TudMetadata,
  TudPiece,
  TudSizeTotal,
} from "@/lib/types/pattern-library";

/**
 * TUKA CAD .tud parser — metadata only, no geometry.
 *
 * File layout: plain-text ASCII header (records between `@ Begin` and `@ End`,
 * latin-1) followed by an embedded 100×100 JFIF JPEG thumbnail and binary
 * geometry. Header records (fields separated by runs of spaces):
 *   /F  <original file path>
 *   -K  StyleCaption  <style name>
 *   -S  <size>  <n>
 *   -X  <size>  <fabric>  <n>  <area cm²>  <perimeter cm>   (per-fabric totals)
 *   -Y  <size>  <n>  <area cm²>  <perimeter cm>             (grand totals)
 *   -P  "<piece>" "<code>" ""                               (starts a piece)
 *   -Q  <piece>  <cut quantity>
 *   -M  <fabric>
 *   -E  <piece>  <size>  <n>  <area m²>  <perimeter cm>
 * Unknown records are skipped; if the header is missing entirely the file is
 * treated as a plain attachment (returns null).
 */

const HEADER_SCAN_LIMIT = 512 * 1024;
const JPEG_START = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const JPEG_END = Buffer.from([0xff, 0xd9]);

export interface ParsedTudFile {
  metadata: TudMetadata;
  /** Embedded JFIF preview (typically 100×100), or null when absent. */
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

/** Extracts the embedded JFIF thumbnail (first FF D8 FF E0 … FF D9 span). */
export function extractTudThumbnail(buffer: Buffer): Buffer | null {
  const start = buffer.indexOf(JPEG_START);
  if (start < 0) return null;
  const end = buffer.indexOf(JPEG_END, start + JPEG_START.length);
  if (end < 0) return null;
  return buffer.subarray(start, end + JPEG_END.length);
}

/**
 * Parses a .tud buffer into metadata + thumbnail. Returns null when the buffer
 * doesn't look like a TUKA file (caller falls back to a plain attachment).
 */
export function parseTudFile(buffer: Buffer): ParsedTudFile | null {
  const headerText = buffer.subarray(0, Math.min(buffer.length, HEADER_SCAN_LIMIT)).toString("latin1");
  const begin = headerText.indexOf("@ Begin");
  if (begin < 0) return null;
  const end = headerText.indexOf("@ End", begin);
  const header = headerText.slice(begin, end > begin ? end : undefined);

  let styleCaption: string | null = null;
  let sourcePath: string | null = null;
  const sizes: string[] = [];
  const pieces: TudPiece[] = [];
  const fabricTotals: TudFabricTotal[] = [];
  const sizeTotals: TudSizeTotal[] = [];
  let currentPiece: TudPiece | null = null;

  const pieceByName = (name: string): TudPiece | null =>
    pieces.find((piece) => piece.name === name) ?? null;

  for (const rawLine of header.split(/\r?\n/)) {
    const line = rawLine.replace(/\0/g, "").trim();
    if (!line) continue;
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
    if (tag === "-S") {
      const size = rest.split(/\s+/)[0];
      if (size && !sizes.includes(size)) sizes.push(size);
      continue;
    }
    if (tag === "-X") {
      // -X <size> <fabric> <n> <area cm²> <perimeter cm>
      const parts = rest.split(/\s+/);
      const area = toNumber(parts[3]);
      const perimeter = toNumber(parts[4]);
      if (parts[0] && parts[1] && area !== null && perimeter !== null) {
        fabricTotals.push({
          size: parts[0],
          fabric: parts[1],
          area_m2: round(area / 10_000, 4),
          perimeter_cm: round(perimeter, 2),
        });
      }
      continue;
    }
    if (tag === "-Y") {
      // -Y <size> <n> <area cm²> <perimeter cm>
      const parts = rest.split(/\s+/);
      const area = toNumber(parts[2]);
      const perimeter = toNumber(parts[3]);
      if (parts[0] && area !== null && perimeter !== null) {
        sizeTotals.push({
          size: parts[0],
          area_m2: round(area / 10_000, 4),
          perimeter_cm: round(perimeter, 2),
        });
      }
      continue;
    }
    if (tag === "-P") {
      const match = rest.match(/^"([^"]*)"/);
      const name = match?.[1]?.trim() ?? "";
      if (name) {
        currentPiece = pieceByName(name) ?? { name, cut_quantity: null, fabric: null, per_size: {} };
        if (!pieces.includes(currentPiece)) pieces.push(currentPiece);
      }
      continue;
    }
    if (tag === "-Q") {
      const parts = rest.split(/\s+/);
      const quantity = toNumber(parts[1]);
      const target = (parts[0] && pieceByName(parts[0])) || currentPiece;
      if (target && quantity !== null) target.cut_quantity = quantity;
      continue;
    }
    if (tag === "-M") {
      const fabric = rest.split(/\s+/)[0];
      if (currentPiece && fabric) currentPiece.fabric = fabric;
      continue;
    }
    if (tag === "-E") {
      // -E <piece> <size> <n> <area m²> <perimeter cm>
      const parts = rest.split(/\s+/);
      const area = toNumber(parts[3]);
      const perimeter = toNumber(parts[4]);
      const target = (parts[0] && pieceByName(parts[0])) || currentPiece;
      if (target && parts[1] && area !== null && perimeter !== null) {
        target.per_size[parts[1]] = { area_m2: area, perimeter_cm: perimeter };
      }
      continue;
    }
    // Unknown record — skip.
  }

  if (!styleCaption && sizes.length === 0 && pieces.length === 0) return null;

  // Fallback totals when -Y is absent: sum single-piece areas × cut quantity.
  if (sizeTotals.length === 0 && pieces.length > 0) {
    for (const size of sizes) {
      let area = 0;
      let perimeter = 0;
      let found = false;
      for (const piece of pieces) {
        const entry = piece.per_size[size];
        if (!entry) continue;
        const quantity = piece.cut_quantity ?? 1;
        area += entry.area_m2 * quantity;
        perimeter += entry.perimeter_cm * quantity;
        found = true;
      }
      if (found) {
        sizeTotals.push({ size, area_m2: round(area, 4), perimeter_cm: round(perimeter, 2) });
      }
    }
  }

  const totalCutPieces = pieces.reduce<number | null>((sum, piece) => {
    if (piece.cut_quantity === null) return sum;
    return (sum ?? 0) + piece.cut_quantity;
  }, null);

  const singleTotal = sizeTotals.length === 1 ? sizeTotals[0]! : null;

  const metadata: TudMetadata = {
    style_caption: styleCaption,
    source_path: sourcePath,
    sizes,
    pieces,
    total_cut_pieces: totalCutPieces,
    fabric_totals: fabricTotals,
    size_totals: sizeTotals,
    total_area_m2: singleTotal ? singleTotal.area_m2 : null,
    total_perimeter_cm: singleTotal ? singleTotal.perimeter_cm : null,
  };

  return { metadata, thumbnail: extractTudThumbnail(buffer) };
}
