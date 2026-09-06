import { readPatternLibraryFresh, writePatternLibrary } from "@/lib/data/pattern-library";
import { writePatternLibraryFile } from "@/lib/pattern-library/file-storage";
import { BOGGI_OVERCOAT_SIZES } from "@/lib/pattern-library/ensure-ready-made-brand-base";
import {
  BOGGI_OVERCOAT_SPEC_FILENAME,
  boggiOvercoatPatternRef,
  buildBasePointsFromSizeRun,
  readyMadeSizeRunClientPatterns,
  stockSizeFromFabric,
} from "@/lib/pattern-library/promote-ready-made-size-run";
import type { PatternLibraryAttachment } from "@/lib/types/pattern-library";

export async function applyBoggiOvercoatPromotion(input: {
  specBytes?: Buffer | null;
  updatedBy?: string | null;
}): Promise<{
  bases: Array<{ id: string; house_brand_code: string; sizes: string[]; points: number }>;
  renamed: Array<{ id: string; pattern_ref: string }>;
}> {
  const store = await readPatternLibraryFresh();
  if (store.base_patterns.length < 20) {
    throw new Error("Pattern library read looks empty. Refusing to promote Boggi Overcoat.");
  }

  const sheets = readyMadeSizeRunClientPatterns(store.client_patterns);
  if (sheets.length === 0) {
    throw new Error("No Boggi Overcoat size-run client sheets found to promote.");
  }

  const sizes = [...BOGGI_OVERCOAT_SIZES];
  const points = buildBasePointsFromSizeRun(sheets, sizes);
  const now = new Date().toISOString();
  const notes =
    "Ready-made Boggi Overcoat base. Promoted from the mistaken person-client size sheets (SO-2026-0142 / SO-2026-0150). Load this base when a real client needs this cut, then change his sizes.";

  const bases = store.base_patterns.filter(
    (base) =>
      base.cut_family.trim().toLowerCase() === "boggi" &&
      base.garment_type.trim().toLowerCase() === "overcoat"
  );
  if (bases.length === 0) {
    throw new Error("Boggi Overcoat base folder is missing. Create the FR/GL bases first.");
  }

  const updatedBases: Array<{
    id: string;
    house_brand_code: string;
    sizes: string[];
    points: number;
  }> = [];

  for (const base of bases) {
    const index = store.base_patterns.findIndex((row) => row.id === base.id);
    if (index < 0) continue;
    let files = [...store.base_patterns[index]!.files];
    if (input.specBytes && input.specBytes.length > 0) {
      const already = files.some((file) => file.filename === BOGGI_OVERCOAT_SPEC_FILENAME);
      if (!already) {
        const storedFilename = `${base.id}-${Date.now()}-Boggi_Measurement_Spec_for_Overcoat.xlsx`;
        await writePatternLibraryFile(
          storedFilename,
          input.specBytes,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        const attachment: PatternLibraryAttachment = {
          id: `plf-${Date.now()}-${base.house_brand_code.toLowerCase()}`,
          kind: "xlsx",
          filename: BOGGI_OVERCOAT_SPEC_FILENAME,
          stored_filename: storedFilename,
          content_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          size_bytes: input.specBytes.length,
          uploaded_at: now,
          uploaded_by: input.updatedBy ?? "erp",
        };
        files = [...files, attachment];
      }
    }
    store.base_patterns[index] = {
      ...store.base_patterns[index]!,
      name: "Boggi Overcoat",
      sizes,
      points,
      style_code: "BO-OC",
      source_file: BOGGI_OVERCOAT_SPEC_FILENAME,
      notes,
      files,
      updated_at: now,
    };
    const next = store.base_patterns[index]!;
    updatedBases.push({
      id: next.id,
      house_brand_code: next.house_brand_code,
      sizes: next.sizes,
      points: next.points.length,
    });
  }

  const renamed: Array<{ id: string; pattern_ref: string }> = [];
  for (const sheet of sheets) {
    const size = stockSizeFromFabric(sheet.fabric);
    if (!size) continue;
    const index = store.client_patterns.findIndex((row) => row.id === sheet.id);
    if (index < 0) continue;
    const nextRef = boggiOvercoatPatternRef(size);
    store.client_patterns[index] = {
      ...store.client_patterns[index]!,
      pattern_ref: nextRef,
      notes:
        "Promoted to the Boggi Overcoat house base. Do not treat this as a person client. Use the base for the next real client.",
      updated_at: now,
    };
    renamed.push({ id: sheet.id, pattern_ref: nextRef });
  }

  await writePatternLibrary(store);
  return { bases: updatedBases, renamed };
}
