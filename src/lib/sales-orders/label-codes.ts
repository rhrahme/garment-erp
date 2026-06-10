import type { GarmentStitchType } from "@/lib/sales-orders/garment-types";
import { isGarmentStitchType } from "@/lib/sales-orders/garment-types";
import { BRAND_CLIENT_CODE_PREFIX, parseClientCodeParts } from "@/lib/clients/codes";

/** All production-brand prefixes (FR, GL, FD, JU, …) — used to drop a redundant brand token. */
const KNOWN_BRAND_PREFIXES = new Set(Object.values(BRAND_CLIENT_CODE_PREFIX).map((p) => p.toUpperCase()));

export interface FabricLabelSticker {
  code: string;
  piece_name: string;
  sequence: number;
}

/** Garment pieces that each get their own label sticker. */
const GARMENT_PIECES: Partial<Record<GarmentStitchType, string[]>> = {
  Suit: ["Jacket", "Trouser"],
  "Overshirt+Trouser": ["Overshirt", "Trouser"],
  "Shirt+Trouser": ["Shirt", "Trouser"],
  "Shirt+Trouser+Short": ["Shirt", "Trouser", "Short"],
  "Shirt+Short": ["Shirt", "Short"],
};

const PIECE_ABBREV: Record<string, string> = {
  Jacket: "JKT",
  Trouser: "TR",
  Shirt: "SHT",
  "Shirt LS": "SHT-LS",
  "Shirt SS": "SHT-SS",
  Overshirt: "OS",
  Short: "SH",
  Overcoat: "OC",
};

export function getGarmentPieces(garmentType: string): string[] {
  if (isGarmentStitchType(garmentType) && GARMENT_PIECES[garmentType]) {
    return GARMENT_PIECES[garmentType]!;
  }
  return [garmentType];
}

function pieceAbbrev(pieceName: string): string {
  return PIECE_ABBREV[pieceName] ?? pieceName.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase();
}

/** One unique sticker code per garment piece — printed by the fabric supplier. */
export function generateFabricLabelStickers(
  clientReference: string,
  lineIndex: number,
  garmentType: string
): FabricLabelSticker[] {
  const pieces = getGarmentPieces(garmentType);
  const linePart = `L${String(lineIndex).padStart(2, "0")}`;

  return pieces.map((piece_name, index) => ({
    code: `${clientReference}-${linePart}-${pieceAbbrev(piece_name)}`,
    piece_name,
    sequence: index + 1,
  }));
}

export function formatLabelGarmentDescription(garmentType: string, pieceName: string): string {
  const pieces = getGarmentPieces(garmentType);
  if (pieces.length === 1) return garmentType;
  return `${garmentType} — ${pieceName}`;
}

/** Client code from a full client reference (e.g. FR-0526-0027-SO-2026-0096 → FR-0526-0027). */
export function clientCodeFromReference(clientReference: string): string {
  const match = clientReference.match(/^(.+)-SO-\d{4}-\d{4,}$/);
  return match ? match[1]! : clientReference;
}

/** Brand prefix from client code (FR, GL, FD, JU). */
export function brandPrefixFromClientCode(clientCode: string): string {
  const parts = parseClientCodeParts(clientCode);
  if (parts) return parts.prefix;
  return clientCode.split("-")[0] ?? clientCode;
}

/** Production suffix after the client code on a full scan sticker. */
export function productionSuffixFromSticker(stickerCode: string, clientCode: string): string {
  const prefix = `${clientCode}-`;
  if (stickerCode.startsWith(prefix)) {
    return stickerCode.slice(prefix.length);
  }
  return stickerCode;
}

/**
 * Short production code per garment piece — used internally after factory re-labels.
 * Example: …-SO-2026-0096-L07-SHT → FR-0096-L07-SHT
 */
export function productionCodeFromSticker(stickerCode: string, clientCode: string): string {
  const brand = brandPrefixFromClientCode(clientCode);
  const suffix = productionSuffixFromSticker(stickerCode, clientCode);

  const match = suffix.match(/^SO-\d{4}-(\d{4,})-(.+)$/i);
  if (match) {
    return `${brand}-${match[1]}-${match[2]}`;
  }

  const trimmed = suffix.replace(/^SO-\d{4}-/, "");
  if (trimmed !== suffix) {
    return `${brand}-${trimmed}`;
  }

  if (suffix.startsWith(`${brand}-`)) return suffix;
  return `${brand}-${suffix}`;
}

/**
 * One production code per fabric cut for suppliers — no piece suffix.
 * Example: …-SO-2026-0096-L11-OS → FR-0096-L11
 */
export function supplierFabricProductionCode(stickerCode: string, clientCode: string): string {
  const brand = brandPrefixFromClientCode(clientCode);
  const suffix = productionSuffixFromSticker(stickerCode, clientCode);
  const match = suffix.match(/^SO-\d{4}-(\d{4,})-(L\d{2})/i);
  if (match) {
    return `${brand}-${match[1]}-${match[2]}`;
  }
  return productionCodeFromSticker(stickerCode, clientCode);
}

/**
 * Drop the leading brand token (FR/GL/FD/JU…) from a production / fabric-cut code.
 * Example: FR-0104-L07 → 0104-L07. Uses the client code's brand when known, and
 * otherwise falls back to any known brand prefix, so it is robust across brands.
 */
export function stripBrandPrefixFromProductionCode(productionCode: string, clientCode?: string): string {
  const trimmed = productionCode.trim();

  if (clientCode) {
    const brand = brandPrefixFromClientCode(clientCode);
    if (brand && trimmed.toUpperCase().startsWith(`${brand.toUpperCase()}-`)) {
      return trimmed.slice(brand.length + 1);
    }
  }

  const leadingToken = trimmed.split("-")[0]?.toUpperCase() ?? "";
  if (KNOWN_BRAND_PREFIXES.has(leadingToken)) {
    return trimmed.slice(leadingToken.length + 1);
  }

  return trimmed;
}

/**
 * Human-readable supplier sticker code: full client code + " / " + the
 * production/fabric-cut code with its (redundant) brand prefix dropped, so the
 * brand appears only ONCE. Example: FR-0626-0032 + FR-0104-L07 → "FR-0626-0032 / 0104-L07".
 */
export function formatSupplierStickerCode(clientCode: string, productionCode: string): string {
  return `${clientCode} / ${stripBrandPrefixFromProductionCode(productionCode, clientCode)}`;
}

export function stickerCodesMatch(scanInput: string, stickerCode: string, clientCode: string): boolean {
  const normalized = scanInput.trim().toUpperCase();
  if (!normalized) return false;
  if (stickerCode.toUpperCase() === normalized) return true;
  if (productionCodeFromSticker(stickerCode, clientCode).toUpperCase() === normalized) return true;
  return supplierFabricProductionCode(stickerCode, clientCode).toUpperCase() === normalized;
}

/** 1-based article # for a fabric line — matches L01, L02… on sticker codes. */
export function fabricLineArticleNumber(zeroBasedLineIndex: number): number {
  return zeroBasedLineIndex + 1;
}

export function lineArticleFromStickerCode(stickerCode: string): number | null {
  const match = stickerCode.match(/-L(\d{2})(?:-|$)/i);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

export function buildFabricLineArticleMap(fabricLineIds: string[]): Map<string, number> {
  return new Map(fabricLineIds.map((id, index) => [id, fabricLineArticleNumber(index)]));
}
