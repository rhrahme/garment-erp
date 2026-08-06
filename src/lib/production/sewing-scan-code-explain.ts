import {
  EMPLOYEE_ALTERATION_QR_PREFIX,
  EMPLOYEE_QR_PREFIX,
  isAnyEmployeeBadgeQrPayload,
  isEmployeeQrPayload,
} from "@/lib/hr/employee-qr";
import { normalizeAwbScanInput } from "@/lib/integrations/normalize-awb-scan";
import { fabricCutCodesMatch } from "@/lib/production/scan-input";
import {
  codesMatchAllowingPieceIndex,
  expandFabricLabelScanInput,
  pieceProductionCodeFromSticker,
  productionCodeFromSticker,
} from "@/lib/sales-orders/label-codes";

/** Inline PL-{line}-{machine} / legacy L{n}-W{nn} check - avoids loading workstation JSON in unit tests. */
function looksLikeWorkstationId(raw: string): boolean {
  const trimmed = raw.trim();
  return /^PL-\d+-\d+$/i.test(trimmed) || /^L\d+-W\d{2}$/i.test(trimmed);
}

/** Prep / fabric-cut QR used at receive & wash - ends at article (L##), no piece suffix. */
export function looksLikeFabricCutWashCode(raw: string): boolean {
  const normalized = raw.trim().toUpperCase();
  if (!normalized) return false;

  const supplier = normalized.match(/^([A-Z]{2}-\d{4}-\d{4})\s*\/\s*(.+)$/);
  if (supplier) {
    const shortProd = supplier[2]!.trim();
    return /L\d{2}$/.test(shortProd) && !/-L\d{2}-/.test(shortProd);
  }

  // FR-0109-L32 or FR-0526-0101-L05 - article terminus, no jacket/trouser suffix.
  return /^[A-Z]{2}-[A-Z0-9-]*L\d{2}$/.test(normalized) && !/-L\d{2}-/.test(normalized);
}

/** Production piece QR shape - article then piece abbrev (JKT, SHT, OS, ...). */
export function looksLikeProductionPieceCode(raw: string): boolean {
  const normalized = raw.trim().toUpperCase();
  if (!normalized) return false;
  return /^[A-Z]{2}-.+?-L\d{2}-[A-Z]/.test(normalized);
}

function looksLikeMalformedEmployeeBadge(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || isAnyEmployeeBadgeQrPayload(trimmed) || isEmployeeQrPayload(trimmed)) {
    return false;
  }
  const upper = trimmed.toUpperCase();
  if (upper === EMPLOYEE_QR_PREFIX || upper === `${EMPLOYEE_QR_PREFIX}:`) return true;
  if (
    upper === EMPLOYEE_ALTERATION_QR_PREFIX ||
    upper === `${EMPLOYEE_ALTERATION_QR_PREFIX}:`
  ) {
    return true;
  }
  if (upper.startsWith(`${EMPLOYEE_ALTERATION_QR_PREFIX}:`)) return true;
  if (upper.startsWith(`${EMPLOYEE_QR_PREFIX}:`)) return true; // EMP: with empty value already handled
  // EMP123 / EMP-001 / EMP_... without the required colon payload.
  return /^EMP[\s_-]?\d/i.test(trimmed) || /^EMP[^A-Z0-9:]/i.test(trimmed);
}

function looksLikeWorkstationPlacard(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (looksLikeWorkstationId(trimmed)) return true;
  return /\/production\/workstation\//i.test(trimmed);
}

/** True when scan matches a garment piece code (not the fabric-cut / wash QR). */
export function scanMatchesPieceProductionCode(
  scanInput: string,
  sticker: { code: string; piece_name: string; sequence?: number },
  clientCode: string,
  siblings: Array<{ code: string; piece_name: string; sequence?: number }>
): boolean {
  for (const candidate of expandFabricLabelScanInput(scanInput)) {
    const normalized = candidate.trim().toUpperCase();
    if (!normalized) continue;
    if (codesMatchAllowingPieceIndex(sticker.code, normalized)) return true;
    const production = productionCodeFromSticker(sticker.code, clientCode);
    if (codesMatchAllowingPieceIndex(production, normalized)) return true;
    const pieceCode = pieceProductionCodeFromSticker(sticker, clientCode, siblings);
    if (codesMatchAllowingPieceIndex(pieceCode, normalized)) return true;
  }
  return false;
}

export function scanMatchesFabricCutCode(scanInput: string, fabricCutCode: string): boolean {
  const cut = fabricCutCode.trim().toUpperCase();
  if (!cut) return false;
  for (const candidate of expandFabricLabelScanInput(scanInput)) {
    const normalized = candidate.trim().toUpperCase();
    if (!normalized) continue;
    if (normalized === cut || fabricCutCodesMatch(normalized, cut)) return true;
  }
  return false;
}

/**
 * Resolved line but the scan was the prep / wash fabric-cut QR, not a piece QR.
 * Stitch must refuse these even though receive/wash accept them.
 */
export function isFabricCutOnlyStitchScan(
  scanInput: string,
  input: {
    fabric_cut_code: string;
    client_code: string;
    stickers: Array<{ code: string; piece_name: string; sequence?: number }>;
  }
): boolean {
  if (!scanMatchesFabricCutCode(scanInput, input.fabric_cut_code)) return false;
  const siblings = input.stickers.length > 0 ? input.stickers : [];
  if (siblings.length === 0) return true;
  return !siblings.some((sticker) =>
    scanMatchesPieceProductionCode(scanInput, sticker, input.client_code, siblings)
  );
}

export function fabricCutWashRejectMessage(raw: string, fabricCutCode?: string | null): string {
  const shown = (fabricCutCode?.trim() || raw.trim() || "fabric-cut").toUpperCase();
  return (
    `This is a fabric-cut / washing QR (${shown}) - used at receive & wash. ` +
    "Scan the production A4 piece QR instead (e.g. FR-0132-L07-JKT-1/2)."
  );
}

/** Explain why a stitch kiosk scan was not accepted as a piece / badge code. */
export function explainUnrecognizedStitchScan(raw: string): string {
  const trimmed = raw.trim();
  const display = trimmed || "(empty)";

  if (looksLikeFabricCutWashCode(trimmed)) {
    return fabricCutWashRejectMessage(trimmed);
  }

  if (looksLikeMalformedEmployeeBadge(trimmed)) {
    return (
      `Malformed employee badge (${display}) - expected EMP:{id} or EMPALT:{id}. ` +
      "Scan your EMP / Alteration badge or a production A4 piece QR."
    );
  }

  if (looksLikeWorkstationPlacard(trimmed)) {
    return (
      `This is a workstation placard QR (${display}) - not a piece code. ` +
      "Scan your EMP / Alteration badge or a production A4 piece QR."
    );
  }

  if (normalizeAwbScanInput(trimmed)) {
    return (
      `This looks like a shipping AWB barcode (${display}) - not a stitch piece. ` +
      "Scan your EMP / Alteration badge or a production A4 piece QR."
    );
  }

  if (looksLikeProductionPieceCode(trimmed)) {
    return (
      `Production piece code not found: ${display}. ` +
      "Check the A4 piece QR on the production sheet (not the prep / wash sticker)."
    );
  }

  return (
    `Code not recognized: ${display}. ` +
    "Stitch accepts EMP badge (EMP:{id}), Alteration badge (EMPALT:{id}), or production A4 piece QR " +
    "(e.g. FR-0132-L07-JKT-1/2)."
  );
}
