/**
 * Determine the D550 driver rotation and prove the counter-rotation fix.
 * - portrait P = what 62c77eb currently emits (correct content, wrong orientation for this driver).
 * - The physical print (IMG_9251) is P rotated 90° CW then clipped to the portrait label.
 * - Fix: emit E = P rotated 90° CCW (landscape 102x51). Driver applies its +90° CW → E becomes P
 *   upright and full on the physical label.
 */
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const srcDir = resolve(projectRoot, "src");
const jiti = createJiti(import.meta.url, { alias: { "@": srcDir }, interopDefault: true });
const { renderStickerPagePng } = await jiti.import(resolve(srcDir, "lib/production/render-sticker-raster.ts"));

const label = {
  sticker_code: "0119-L35", fabric_line_id: "l35", client_code: "FR-0726-0039",
  client_name: "Abdelaziz Mohamad Al Ajlan", production_code: "0119-L35", fabric_cut_code: "0119-L35",
  piece_name: "Shirt", fabric_number: "722037", garment_type: "Shirt", supplier_name: "Loro Piana",
  fabric_brand: "Loro Piana", composition: '100% COTONE "KNIT SHIRT"', weight_gsm: null,
  cut_quantity: 1.5, cut_unit: "meters", labels_sent: 1, article_number: 35, sticker_index: 35, sticker_total: 36,
  qr_payload: "0119-L35",
};

const P = await renderStickerPagePng(label, "prep", new Map(), "printer-match", 100);
const m = await sharp(P).metadata();
const W = m.width, H = m.height;
console.log("portrait P:", W, "x", H);

// Confirm the driver = 90° CW: rotate P 90° CW, keep the RIGHT strip (where the QR lands), clip to label.
{
  const r = await sharp(P).rotate(90, { background: "#fff" }).toBuffer();
  const rm = await sharp(r).metadata(); // 815 x 408
  const keepW = Math.min(rm.width, W), keepH = Math.min(rm.height, H);
  const clip = await sharp(r).extract({ left: rm.width - keepW, top: 0, width: keepW, height: keepH }).toBuffer();
  const canvas = await sharp({ create: { width: W, height: H, channels: 3, background: "#fff" } })
    .composite([{ input: clip, left: 0, top: 0 }]).png().toBuffer();
  writeFileSync(resolve(projectRoot, "diag-driver-90cw.png"), canvas);
}

// The fix's emitted raster E = P rotated 90° CCW → landscape 102x51. This is what preview shows.
const E = await sharp(P).rotate(270, { background: "#fff" })
  .png({ compressionLevel: 6, palette: true, colours: 2 }).toBuffer();
writeFileSync(resolve(projectRoot, "diag-emit-landscape.png"), E);
const em = await sharp(E).metadata();
console.log("emitted landscape E:", em.width, "x", em.height);

// Round-trip: driver applies +90° CW to E → should be P upright & full (nothing clipped).
const roundtrip = await sharp(E).rotate(90, { background: "#fff" }).png().toBuffer();
writeFileSync(resolve(projectRoot, "diag-roundtrip-upright.png"), roundtrip);
const rtm = await sharp(roundtrip).metadata();
console.log("round-trip (driver rotates E back):", rtm.width, "x", rtm.height, "(expect", W, "x", H, "upright)");
