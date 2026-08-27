import { normalizeScannerInput } from "@/lib/production/scan-input";

/**
 * Pull the box id out of a sticker scan. The printed QR is the open URL
 * (/inventory/cartons/ctn-...), but a USB scanner may also type just the id.
 */
export function parseInventoryBoxScan(raw: string | null | undefined): string | null {
  const text = normalizeScannerInput(raw ?? "");
  if (!text) return null;

  const fromPath = text.match(/\/inventory\/cartons\/([^/?#\s]+)/i);
  if (fromPath?.[1]) {
    try {
      return decodeURIComponent(fromPath[1]);
    } catch {
      return fromPath[1];
    }
  }

  return text;
}

/** How many pieces (or meters) live in each new box. */
export function resolveBoxQuantities(
  boxCount: number,
  quantityPerBox: number,
  quantities?: number[]
): number[] {
  if (quantities && quantities.length > 0) {
    if (quantities.length > 200) {
      throw new Error("Box count must be between 1 and 200.");
    }
    return quantities.map((value) => {
      const quantity = Number(value);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error("Write how many are inside each box.");
      }
      return Math.round(quantity * 100) / 100;
    });
  }

  const count = Math.floor(boxCount);
  if (!Number.isFinite(count) || count < 1 || count > 200) {
    throw new Error("Box count must be between 1 and 200.");
  }
  if (!Number.isFinite(quantityPerBox) || quantityPerBox <= 0) {
    throw new Error("Write how many are inside each box.");
  }
  const quantity = Math.round(quantityPerBox * 100) / 100;
  return Array.from({ length: count }, () => quantity);
}
