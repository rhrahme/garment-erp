#!/usr/bin/env node
/**
 * Sample local Loro Piana / Solbiati swatch JPEGs and write approximate colors.
 *
 * Usage:
 *   node scripts/extract-loro-piana-swatch-colors.mjs
 *   node scripts/extract-loro-piana-swatch-colors.mjs --limit 50
 *
 * Output: src/data/suppliers/loro-piana-swatch-colors.json
 *   { "771029": { "color": "Dark brown", "hex": "#3c281c" }, ... }
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

const ROOT = process.cwd();
const IMAGES_DIR = path.join(ROOT, "data/suppliers/loro-piana/images");
const OUT_PATH = path.join(ROOT, "src/data/suppliers/loro-piana-swatch-colors.json");

const COLOR_ANCHORS = [
  { name: "Black", r: 20, g: 20, b: 20 },
  { name: "Charcoal", r: 55, g: 55, b: 58 },
  { name: "Grey", r: 128, g: 128, b: 128 },
  { name: "Light grey", r: 190, g: 190, b: 190 },
  { name: "Off-white", r: 235, g: 230, b: 220 },
  { name: "Ivory", r: 245, g: 240, b: 225 },
  { name: "Cream", r: 240, g: 228, b: 200 },
  { name: "Beige", r: 210, g: 190, b: 155 },
  { name: "Sand", r: 198, g: 175, b: 140 },
  { name: "Camel", r: 180, g: 140, b: 90 },
  { name: "Tan", r: 165, g: 120, b: 75 },
  { name: "Brown", r: 110, g: 70, b: 40 },
  { name: "Dark brown", r: 60, g: 40, b: 28 },
  { name: "Chocolate", r: 75, g: 45, b: 30 },
  { name: "Rust", r: 160, g: 70, b: 40 },
  { name: "Terracotta", r: 175, g: 85, b: 60 },
  { name: "Orange", r: 210, g: 110, b: 40 },
  { name: "Mustard", r: 195, g: 155, b: 50 },
  { name: "Gold", r: 185, g: 150, b: 70 },
  { name: "Olive", r: 100, g: 105, b: 55 },
  { name: "Khaki", r: 140, g: 130, b: 90 },
  { name: "Green", r: 55, g: 110, b: 65 },
  { name: "Forest green", r: 35, g: 70, b: 45 },
  { name: "Teal", r: 40, g: 110, b: 115 },
  { name: "Navy", r: 30, g: 45, b: 85 },
  { name: "Blue", r: 50, g: 90, b: 160 },
  { name: "Light blue", r: 140, g: 175, b: 210 },
  { name: "Sky blue", r: 110, g: 165, b: 210 },
  { name: "Purple", r: 95, g: 55, b: 130 },
  { name: "Burgundy", r: 95, g: 30, b: 45 },
  { name: "Wine", r: 110, g: 40, b: 55 },
  { name: "Red", r: 170, g: 40, b: 40 },
  { name: "Pink", r: 210, g: 140, b: 160 },
  { name: "Rose", r: 190, g: 115, b: 125 },
];

function nameColorFromRgb(rgb) {
  const r = rgb.r;
  const g = rgb.g;
  const b = rgb.b;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  if (chroma < 55 && r >= b + 3 && r >= g - 8) {
    if (max < 100) return "Dark brown";
    if (max < 145) return "Brown";
    if (max < 185) return "Tan";
    return "Beige";
  }
  let best = COLOR_ANCHORS[0];
  let bestDist = Infinity;
  for (const anchor of COLOR_ANCHORS) {
    const dr = r - anchor.r;
    const dg = g - anchor.g;
    const db = b - anchor.b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = anchor;
    }
  }
  return best.name;
}

function rgbToHex(rgb) {
  const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(rgb.r)}${h(rgb.g)}${h(rgb.b)}`;
}

async function sampleSwatch(filePath) {
  const meta = await sharp(filePath).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 32 || height < 32) {
    throw new Error("image too small");
  }
  // LP bunches: ruler left + bottom. Crop center cloth only.
  const left = Math.floor(width * 0.22);
  const top = Math.floor(height * 0.12);
  const cropW = Math.max(16, Math.floor(width * 0.56));
  const cropH = Math.max(16, Math.floor(height * 0.62));
  const { data, info } = await sharp(filePath)
    .extract({ left, top, width: cropW, height: cropH })
    .resize(24, 24, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  const channels = info.channels || 3;
  for (let i = 0; i + 2 < data.length; i += channels) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    count += 1;
  }
  const rgb = { r: r / count, g: g / count, b: b / count };
  return {
    color: nameColorFromRgb(rgb),
    hex: rgbToHex(rgb),
  };
}

function parseArgs(argv) {
  let limit = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--limit" && argv[i + 1]) {
      limit = Number(argv[i + 1]);
      i += 1;
    }
  }
  return { limit: Number.isFinite(limit) && limit > 0 ? limit : null };
}

async function main() {
  const { limit } = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(IMAGES_DIR)) {
    console.error("Missing images dir:", IMAGES_DIR);
    process.exit(1);
  }
  let files = fs
    .readdirSync(IMAGES_DIR)
    .filter((name) => /\.jpe?g$/i.test(name))
    .sort();
  if (limit) files = files.slice(0, limit);

  const out = {};
  let ok = 0;
  let fail = 0;
  const started = Date.now();
  for (let i = 0; i < files.length; i += 1) {
    const name = files[i];
    const fabricNumber = path.basename(name, path.extname(name));
    try {
      out[fabricNumber] = await sampleSwatch(path.join(IMAGES_DIR, name));
      ok += 1;
    } catch (error) {
      fail += 1;
      console.warn("skip", fabricNumber, error instanceof Error ? error.message : error);
    }
    if ((i + 1) % 200 === 0 || i + 1 === files.length) {
      const sec = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`progress ${i + 1}/${files.length} ok=${ok} fail=${fail} ${sec}s`);
    }
  }

  const payload = {
    document_type: "loro_piana_swatch_colors",
    generated_at: new Date().toISOString(),
    source_dir: "data/suppliers/loro-piana/images",
    fabric_count: Object.keys(out).length,
    colors: out,
  };
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log("wrote", OUT_PATH, "fabrics", payload.fabric_count);
  if (out["771029"]) console.log("771029 =>", out["771029"]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
