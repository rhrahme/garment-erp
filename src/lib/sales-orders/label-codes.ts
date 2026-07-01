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
  "Thobe+Jacket": ["Thobe", "Jacket"],
  "Thobe+Vest": ["Thobe", "Vest"],
  "Fabric only": [],
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
  "Formal Thobe": "FTHB",
  "House Thobe": "HTHB",
  Thobe: "THB",
  Vest: "VST",
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

/** Invoice display for a multi-piece garment sold as one set (e.g. Suit (Jacket + Trouser)). */
export function formatCombinedGarmentDescription(garmentType: string, pieceNames: string[]): string {
  if (pieceNames.length <= 1) {
    return formatLabelGarmentDescription(garmentType, pieceNames[0] ?? garmentType);
  }
  return `${garmentType} (${pieceNames.join(" + ")})`;
}

function normalizeInvoicePieceName(name: string): string {
  const trimmed = name.trim();
  if (/^trousers?$/i.test(trimmed)) return "Trouser";
  if (/^blazers?$/i.test(trimmed)) return "Jacket";
  return trimmed;
}

export function pieceNamesFromInvoicePieceField(pieceName: string | null | undefined): string[] {
  if (!pieceName?.trim()) return [];
  if (pieceName.includes(" + ")) return pieceName.split(" + ").map((name) => name.trim());
  return [pieceName.trim()];
}

/** True when piece names represent a jacket + trouser set sold as one suit line. */
export function isJacketTrouserPieceSet(pieceNames: string[]): boolean {
  const normalized = new Set(pieceNames.map(normalizeInvoicePieceName));
  return normalized.has("Jacket") && normalized.has("Trouser");
}

/** Use Suit for combined jacket/trouser lines even when garment_type is still Jacket or Trouser. */
export function resolveCombinedGarmentType(garmentType: string, pieceNames: string[]): string {
  if (isJacketTrouserPieceSet(pieceNames)) return "Suit";
  return garmentType;
}

/** Client-facing invoice garment description — shared by build, display, and combine paths. */
export function resolveInvoiceGarmentDescription(
  garmentType: string,
  pieceName: string | null | undefined
): string {
  const pieceNames = pieceNamesFromInvoicePieceField(pieceName);
  const effectiveType = resolveCombinedGarmentType(garmentType, pieceNames);
  if (pieceNames.length > 1) return formatCombinedGarmentDescription(effectiveType, pieceNames);
  return formatLabelGarmentDescription(effectiveType, pieceName ?? garmentType);
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
 * Human-readable supplier sticker code: full client code + "/ " + the
 * production/fabric-cut code with its (redundant) brand prefix dropped, so the
 * brand appears only ONCE. Example: FR-0626-0032 + FR-0104-L07 → "FR-0626-0032/ 0104-L07".
 */
export function formatSupplierStickerCode(clientCode: string, productionCode: string): string {
  return `${clientCode}/ ${stripBrandPrefixFromProductionCode(productionCode, clientCode)}`;
}

/** Client code prefix — FR-0226-0024, GL-0326-0003, etc. */
const CLIENT_CODE_PATTERN = /^[A-Z]{2}-\d{4}-\d{4}$/;

/**
 * Expand pasted / scanned fabric labels into canonical codes the scan pipeline understands.
 * Handles supplier format (FR-0226-0024/ 0109-L32), full piece stickers, and shorthand cut codes.
 */
export function expandFabricLabelScanInput(raw: string): string[] {
  const normalized = raw.trim().toUpperCase();
  if (!normalized) return [];

  const candidates: string[] = [normalized];

  const supplierSplit = normalized.match(/^([A-Z]{2}-\d{4}-\d{4})\s*\/\s*(.+)$/);
  if (supplierSplit) {
    const clientCode = supplierSplit[1]!;
    const shortProd = supplierSplit[2]!.trim();
    const brand = brandPrefixFromClientCode(clientCode);
    if (shortProd && CLIENT_CODE_PATTERN.test(clientCode)) {
      const withBrand = shortProd.startsWith(`${brand}-`) ? shortProd : `${brand}-${shortProd}`;
      candidates.push(withBrand);
    }
  }

  return [...new Set(candidates.filter(Boolean))];
}

/** True when input looks like a fabric label, not an employee name or badge ID. */
export function looksLikeFabricLabelInput(raw: string): boolean {
  const normalized = raw.trim().toUpperCase();
  if (!normalized || normalized.length < 8) return false;

  if (/^[A-Z]{2}-\d{4}-\d{4}\s*\/\s*.+/.test(normalized)) return true;
  if (/^[A-Z]{2}-\d{4}-\d{4}-SO-\d{4}-\d{4,}-L\d{2}/.test(normalized)) return true;
  if (/^[A-Z]{2}-\d{4}-L\d{2}(?:-|$)/.test(normalized)) return true;

  return false;
}

export function stickerCodesMatch(scanInput: string, stickerCode: string, clientCode: string): boolean {
  for (const candidate of expandFabricLabelScanInput(scanInput)) {
    const normalized = candidate.trim().toUpperCase();
    if (!normalized) continue;
    if (stickerCode.toUpperCase() === normalized) return true;
    if (productionCodeFromSticker(stickerCode, clientCode).toUpperCase() === normalized) return true;
    if (supplierFabricProductionCode(stickerCode, clientCode).toUpperCase() === normalized) return true;
  }
  return false;
}

/** 1-based article # for a fabric line — matches L01, L02… on sticker codes. */
export function fabricLineArticleNumber(zeroBasedLineIndex: number): number {
  return zeroBasedLineIndex + 1;
}

/** Sticker / invoice article label — e.g. L01, L02. */
export function formatFabricLineArticle(articleNumber: number | null | undefined): string {
  if (articleNumber == null || !Number.isFinite(articleNumber)) return "—";
  return `L${String(articleNumber).padStart(2, "0")}`;
}

export function lineArticleFromStickerCode(stickerCode: string): number | null {
  const match = stickerCode.match(/-L(\d{2})(?:-|$)/i);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

/** SO article from label stickers — L07 on sticker, not array index when lines were deleted. */
export function soArticleFromFabricLine(
  line: { label_stickers?: Array<{ code: string }> | null }
): number | null {
  for (const sticker of line.label_stickers ?? []) {
    const article = lineArticleFromStickerCode(sticker.code);
    if (article != null) return article;
  }
  return null;
}

export function resolveSoArticleForFabricLine(
  line: { label_stickers?: Array<{ code: string }> | null },
  fallbackIndex: number
): number {
  return soArticleFromFabricLine(line) ?? fabricLineArticleNumber(fallbackIndex);
}

export function buildSoArticleMapFromFabricLines(
  lines: Array<{ id: string; label_stickers?: Array<{ code: string }> | null }>
): Map<string, number> {
  return new Map(
    lines.map((line, index) => [line.id, resolveSoArticleForFabricLine(line, index)])
  );
}

/** Draft / list rows keyed by lineId — sticker when present, else position in order. */
export function buildSoArticleMapFromDraftLines(
  lines: Array<{ lineId: string; label_stickers?: Array<{ code: string }> | null }>
): Map<string, number> {
  return new Map(
    lines.map((line, index) => [line.lineId, resolveSoArticleForFabricLine(line, index)])
  );
}

export function buildFabricLineArticleMap(fabricLineIds: string[]): Map<string, number> {
  return new Map(fabricLineIds.map((id, index) => [id, fabricLineArticleNumber(index)]));
}

/** Tail of sticker code after client ref — e.g. L07-SHT-LS from FR-0426-0006-SO-2026-0008-L07-SHT-LS. */
export function stickerCodeArticleSuffix(stickerCode: string): string | null {
  const match = stickerCode.match(/L\d{2}(?:-.+)?$/i);
  return match ? match[0].toUpperCase() : null;
}
