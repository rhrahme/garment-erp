#!/usr/bin/env node
/**
 * Prove DXF outline extract + nest: writes SVG (+ optional PNG via sharp).
 *
 * Usage:
 *   node --experimental-strip-types --experimental-loader ./scripts/tsconfig-paths-loader.mjs \
 *     scripts/proof-dxf-outlines.mjs [path/to/file.dxf]
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const dxfPath =
  process.argv[2] ||
  path.join(
    process.env.HOME ?? "",
    "Downloads",
    "Youssef Al Rashed Jacket 25.06.26.dxf"
  );

if (!fs.existsSync(dxfPath)) {
  console.error(`DXF not found: ${dxfPath}`);
  process.exit(1);
}

const { parseDxfFile } = await import(
  pathToFileURL(
    path.join(process.cwd(), "src/lib/pattern-library/dxf-parser.ts")
  ).href
);
const { estimateNestFromDxf } = await import(
  pathToFileURL(
    path.join(process.cwd(), "src/lib/pattern-library/nest-estimate.ts")
  ).href
);
const { outlinePointsForPlacement } = await import(
  pathToFileURL(
    path.join(process.cwd(), "src/lib/pattern-library/dxf-parser.ts")
  ).href
);

const buf = fs.readFileSync(dxfPath);
const parsed = parseDxfFile(buf);
if (!parsed) {
  console.error("Failed to parse DXF");
  process.exit(1);
}

const fabricWidthCm = Number(process.env.FABRIC_WIDTH_CM || 150);
const doubleFold = process.env.DOUBLE_FOLD !== "0";
const nest = estimateNestFromDxf({
  dxf: parsed.metadata,
  fabric_width_cm: fabricWidthCm,
  double_fold: doubleFold,
  garment_qty: 1,
});
if (!nest) {
  console.error("Failed to nest DXF pieces");
  process.exit(1);
}

const usable = nest.usable_width_cm;
const lengthCm = Math.max(
  nest.packed_length_m * 100,
  ...nest.placements.map((p) => p.x_cm + p.width_cm),
  40
);
const viewW = 1400;
const viewH = Math.max(220, Math.round((viewW * usable) / lengthCm));
const sx = viewW / lengthCm;
const sy = viewH / usable;

const colors = [
  "#ecfdf5",
  "#f0fdf4",
  "#f7fee7",
  "#eff6ff",
  "#f8fafc",
  "#fafafa",
  "#f5f5f4",
];
const colorByName = new Map();
let ci = 0;
for (const p of nest.placements) {
  if (!colorByName.has(p.name)) {
    colorByName.set(p.name, colors[ci % colors.length]);
    ci += 1;
  }
}

const pieces = nest.placements
  .map((p) => {
    const local = outlinePointsForPlacement(
      p.outline_cm,
      p,
      p.outline_width_cm ?? undefined
    );
    const fill = colorByName.get(p.name) ?? "#ecfdf5";
    if (local?.length >= 3) {
      const pts = local
        .map((pt) => `${(p.x_cm + pt.x) * sx},${(p.y_cm + pt.y) * sy}`)
        .join(" ");
      return `<g>
  <polygon points="${pts}" fill="${fill}" stroke="#166534" stroke-width="1.5" opacity="0.95"/>
  <text x="${(p.x_cm + p.width_cm / 2) * sx}" y="${(p.y_cm + p.height_cm / 2) * sy}"
    text-anchor="middle" dominant-baseline="middle" font-size="10" fill="#14532d"
    font-family="ui-sans-serif,system-ui,sans-serif">${escapeXml(p.name)}</text>
</g>`;
    }
    return `<rect x="${p.x_cm * sx}" y="${p.y_cm * sy}" width="${p.width_cm * sx}" height="${p.height_cm * sy}" fill="${fill}" stroke="#166534"/>`;
  })
  .join("\n");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${viewW}" height="${viewH + 48}" viewBox="0 0 ${viewW} ${viewH + 48}">
  <rect width="100%" height="100%" fill="#18181b"/>
  <text x="12" y="20" fill="#e4e4e7" font-size="14" font-family="ui-sans-serif,system-ui,sans-serif">
    ${escapeXml(parsed.metadata.style_caption || path.basename(dxfPath))} - ${parsed.metadata.pieces.length} piece types · ${nest.placements.length} cut · size ${escapeXml(nest.size)} · usable ${usable}cm · packed ${nest.packed_length_m.toFixed(2)}m
  </text>
  <g transform="translate(0,36)">
    <rect x="0" y="0" width="${viewW}" height="${viewH}" fill="#3f3f46"/>
    ${pieces}
  </g>
</svg>
`;

function escapeXml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const outDir = path.join(process.cwd(), "tmp-pdf-inspect");
fs.mkdirSync(outDir, { recursive: true });
const base = "youssef-jacket-dxf-nest-proof";
const svgPath = path.join(outDir, `${base}.svg`);
fs.writeFileSync(svgPath, svg);
console.log(`Wrote ${svgPath}`);
console.log(
  JSON.stringify(
    {
      pieces: parsed.metadata.pieces.map((p) => ({
        name: p.name,
        qty: p.cut_quantity,
        fabric: p.fabric,
        w_cm: p.width_cm,
        h_cm: p.height_cm,
        verts: p.outline_cm.length,
      })),
      nest: {
        size: nest.size,
        usable_width_cm: nest.usable_width_cm,
        packed_length_m: nest.packed_length_m,
        placements: nest.placements.length,
        efficiency_pct: nest.efficiency_pct,
      },
    },
    null,
    2
  )
);

try {
  const sharp = (await import("sharp")).default;
  const pngPath = path.join(outDir, `${base}.png`);
  await sharp(Buffer.from(svg)).png().toFile(pngPath);
  console.log(`Wrote ${pngPath}`);
} catch (err) {
  console.warn("PNG via sharp skipped:", err?.message || err);
}
