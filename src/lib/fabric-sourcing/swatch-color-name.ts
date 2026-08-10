/**
 * Map an average RGB sample (from a fabric swatch) to a short ERP color label.
 * ASCII-only names for Vercel source safety.
 */

export type Rgb = { r: number; g: number; b: number };

/** Named anchors used for nearest-neighbor labeling. */
const COLOR_ANCHORS: Array<{ name: string; r: number; g: number; b: number }> = [
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

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function rgbToHex(rgb: Rgb): string {
  const r = clampByte(rgb.r).toString(16).padStart(2, "0");
  const g = clampByte(rgb.g).toString(16).padStart(2, "0");
  const b = clampByte(rgb.b).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

function distanceSq(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

/**
 * Nearest named color for an RGB average from a swatch crop.
 * Warm low-chroma darks (common on wool/linen bunches) map to brown, not grey.
 */
export function nameColorFromRgb(rgb: Rgb): string {
  const r = rgb.r;
  const g = rgb.g;
  const b = rgb.b;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  // Warm neutral: red channel leads slightly (bunches with brown ground).
  if (chroma < 55 && r >= b + 3 && r >= g - 8) {
    if (max < 100) return "Dark brown";
    if (max < 145) return "Brown";
    if (max < 185) return "Tan";
    return "Beige";
  }

  let best = COLOR_ANCHORS[0]!;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const anchor of COLOR_ANCHORS) {
    const dist = distanceSq(rgb, anchor);
    if (dist < bestDist) {
      bestDist = dist;
      best = anchor;
    }
  }
  return best.name;
}

/** Average RGB from tightly packed raw RGB bytes (no alpha). */
export function averageRgbFromRaw(data: Uint8Array | Buffer, channels = 3): Rgb {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let i = 0; i + channels - 1 < data.length; i += channels) {
    r += data[i]!;
    g += data[i + 1]!;
    b += data[i + 2]!;
    count += 1;
  }
  if (count === 0) return { r: 128, g: 128, b: 128 };
  return { r: r / count, g: g / count, b: b / count };
}
