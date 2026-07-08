/**
 * Decode QR codes from image files using the pure-JS jsQR decoder (vendored).
 * Usage: node scripts/decode-qr.mjs <image1> [image2 ...]
 * Prints: PATH  OK|FAIL  <payload>
 * Exit 0 only if every image decoded.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const jsQR = require(resolve(__dirname, "vendor/jsQR.js"));

let okAll = true;
for (const path of process.argv.slice(2)) {
  try {
    const { data, info } = await sharp(path)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const result = jsQR(
      new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
      info.width,
      info.height
    );
    if (result && result.data) {
      console.log(`${path}\tOK\t${result.data}`);
    } else {
      console.log(`${path}\tFAIL\t<no QR detected>`);
      okAll = false;
    }
  } catch (e) {
    console.log(`${path}\tERROR\t${e.message}`);
    okAll = false;
  }
}
process.exit(okAll ? 0 : 1);
