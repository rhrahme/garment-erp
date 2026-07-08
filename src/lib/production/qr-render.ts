import sharp from "sharp";
import qrcode from "@/lib/production/vendor/qrcode-generator.js";

/**
 * Local, offline QR generation with CRISP integer-pixel modules.
 *
 * The previous pipeline fetched a raster QR from a remote API at a fixed pixel
 * size that was not an integer multiple of the module count, then resampled it
 * (nearest-neighbor resize + 300→203 DPI print downscale). Every non-integer
 * resample shifts module boundaries and fragments the code — the exact corruption
 * seen on the D550. Here we build the module matrix ourselves and paint each module
 * as a whole block of N device pixels, with a 4-module quiet zone, so the QR never
 * needs resampling and prints razor-sharp at the printer's native resolution.
 */

/** ISO/IEC 18004 mandates a 4-module quiet zone; scanners fail to locate the code without it. */
export const QR_QUIET_MODULES = 4;

export type QrPlan = {
  moduleCount: number;
  modulePx: number;
  /** Full rendered square edge in device px (includes quiet zone). */
  dim: number;
};

function qrModel(payload: string, ecl: "L" | "M" | "Q" | "H" = "M") {
  const qr = qrcode(0, ecl);
  qr.addData(payload);
  qr.make();
  return qr;
}

/**
 * Largest integer module size that fits `targetPx`, plus the resulting square edge.
 * modulePx is always an integer → modules are whole pixel blocks → no fragmentation.
 */
export function planQr(
  payload: string,
  targetPx: number,
  ecl: "L" | "M" | "Q" | "H" = "M"
): QrPlan {
  const moduleCount = qrModel(payload, ecl).getModuleCount();
  const totalModules = moduleCount + QR_QUIET_MODULES * 2;
  const modulePx = Math.max(1, Math.floor(targetPx / totalModules));
  return { moduleCount, modulePx, dim: totalModules * modulePx };
}

/**
 * Crisp bilevel (1-channel) QR PNG built pixel-exactly from the module matrix.
 * The returned square edge is `planQr(...).dim` (≤ targetPx); composite it without
 * any further resize so modules stay whole pixels.
 */
export async function renderQrPngBuffer(
  payload: string,
  targetPx: number,
  ecl: "L" | "M" | "Q" | "H" = "M"
): Promise<{ png: Buffer; plan: QrPlan }> {
  const qr = qrModel(payload, ecl);
  const moduleCount = qr.getModuleCount();
  const totalModules = moduleCount + QR_QUIET_MODULES * 2;
  const modulePx = Math.max(1, Math.floor(targetPx / totalModules));
  const dim = totalModules * modulePx;

  // 1-channel greyscale raw buffer, white background, black module blocks.
  const raw = Buffer.alloc(dim * dim, 255);
  for (let r = 0; r < moduleCount; r += 1) {
    for (let c = 0; c < moduleCount; c += 1) {
      if (!qr.isDark(r, c)) continue;
      const y0 = (r + QR_QUIET_MODULES) * modulePx;
      const x0 = (c + QR_QUIET_MODULES) * modulePx;
      for (let dy = 0; dy < modulePx; dy += 1) {
        const rowStart = (y0 + dy) * dim + x0;
        raw.fill(0, rowStart, rowStart + modulePx);
      }
    }
  }

  const png = await sharp(raw, { raw: { width: dim, height: dim, channels: 1 } })
    .png({ compressionLevel: 9, palette: true, colours: 2 })
    .toBuffer();

  return { png, plan: { moduleCount, modulePx, dim } };
}
