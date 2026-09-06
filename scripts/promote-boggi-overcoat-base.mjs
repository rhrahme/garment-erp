import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { ensurePatternLibraryDocLoaded, readPatternLibraryFresh } from "../src/lib/data/pattern-library.ts";
import { isSupabaseDocumentsStorage } from "../src/lib/data/document-persistence.ts";
import { applyBoggiOvercoatPromotion } from "../src/lib/pattern-library/apply-boggi-overcoat-promotion.ts";
import { BOGGI_OVERCOAT_SIZES } from "../src/lib/pattern-library/ensure-ready-made-brand-base.ts";
import {
  buildBasePointsFromSizeRun,
  readyMadeSizeRunClientPatterns,
} from "../src/lib/pattern-library/promote-ready-made-size-run.ts";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const i = trimmed.indexOf("=");
  if (i < 1) continue;
  const key = trimmed.slice(0, i);
  const value = trimmed.slice(i + 1).replace(/^["']|["']$/g, "");
  if (!process.env[key]) process.env[key] = value;
}

if (!isSupabaseDocumentsStorage()) {
  throw new Error("Supabase is not configured. Refusing to write local-only pattern library.");
}

await ensurePatternLibraryDocLoaded();
const store = await readPatternLibraryFresh();
if (store.base_patterns.length < 20) {
  throw new Error(`Refusing promote: only ${store.base_patterns.length} bases after Supabase read.`);
}

const sheets = readyMadeSizeRunClientPatterns(store.client_patterns);
const points = buildBasePointsFromSizeRun(sheets, [...BOGGI_OVERCOAT_SIZES]);
const outPath = path.join(tmpdir(), "Boggi Measurement Spec for Overcoat.xlsx");
const py = spawnSync(
  "python3",
  [path.join(process.cwd(), "scripts/write-boggi-overcoat-spec.py")],
  {
    input: JSON.stringify({
      sizes: [...BOGGI_OVERCOAT_SIZES],
      points,
      out_path: outPath,
    }),
    encoding: "utf8",
  }
);
if (py.status !== 0) {
  throw new Error(py.stderr || py.stdout || "Failed to write Boggi Overcoat xlsx.");
}

const specBytes = readFileSync(outPath);
const result = await applyBoggiOvercoatPromotion({
  specBytes,
  updatedBy: "erp-ready-made-folder",
});
writeFileSync(outPath, specBytes);
console.log(JSON.stringify({ spec: outPath, ...result }, null, 2));
