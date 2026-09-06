import { readFileSync } from "node:fs";
import { ensurePatternLibraryDocLoaded } from "../src/lib/data/pattern-library.ts";
import { isSupabaseDocumentsStorage } from "../src/lib/data/document-persistence.ts";
import { ensureBoggiOvercoatBases } from "../src/lib/pattern-library/ensure-ready-made-brand-base.ts";

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
const result = await ensureBoggiOvercoatBases("erp-ready-made-folder");
console.log(
  JSON.stringify(
    {
      storage: "supabase",
      created: result.created.map((base) => ({
        id: base.id,
        house_brand_code: base.house_brand_code,
        cut_family: base.cut_family,
        garment_type: base.garment_type,
        sizes: base.sizes,
      })),
      existing: result.existing.map((base) => ({
        id: base.id,
        house_brand_code: base.house_brand_code,
        cut_family: base.cut_family,
        garment_type: base.garment_type,
      })),
    },
    null,
    2
  )
);
