/**
 * Correction: the uploaded TUKA file turned out to contain a SHORTS pattern
 * (source folder "SHORT"; pieces WAIST_BELT, D/FLY, PANT_PKT...), not a shirt.
 * Re-classify the client pattern truthfully using the app's own mutations.
 */
import fs from "node:fs";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && process.env[match[1]] === undefined) {
    process.env[match[1]] = match[2];
  }
}

const PATTERN_ID = "cp-1784935127357-1";
const UPDATED_BY = "info@hagan.pro";

const { readPatternLibraryFresh } = await import("../src/lib/data/pattern-library");
const { updateClientPattern, updateClientPatternVersion } = await import(
  "../src/lib/pattern-library/mutations"
);

const updated = await updateClientPattern(
  PATTERN_ID,
  {
    garment_type: "shorts",
    base_pattern_id: null,
    base_size: "2XL",
    pattern_ref: "SHORTS-LINEN-2XL",
    fabric: "Linen",
    description:
      "Linen shorts — size 2XL. TUKA CAD pattern from client file dated 20.07.26 (14 pieces, 23 cut pieces, 1.44 m²).",
    notes:
      "Client file received 20.07.26. TUKA source: C:\\TUKAdata\\Mahrab pattern\\Abdel Aziz Ajlan Al Ajlan\\SHORT. " +
      "Note: filename says 'Linen' and prior Excel analysis suggested a linen shirt, but the pattern pieces are shorts " +
      "(waist belt, fly, pant pockets). Client also has Shirt LS lines on SO-2026-0122 (Loro Piana 722042).",
  },
  { updatedBy: UPDATED_BY }
);
if (!updated.ok) throw new Error(`updateClientPattern failed: ${updated.error}`);
console.log(`Pattern re-classified: ${updated.pattern.pattern_ref} / ${updated.pattern.garment_type}`);

// Replace the trial's shirt-template measurement rows with the shorts template
// (same shape buildMeasurementsFromTemplate produces).
const store = await readPatternLibraryFresh();
const shortsPoints = store.dictionary.filter((p) => p.garment_types.includes("shorts"));
const versionId = updated.pattern.versions[0]!.id;
const result = await updateClientPatternVersion(
  PATTERN_ID,
  versionId,
  {
    measurements: shortsPoints.map((point) => ({
      point_id: point.id,
      name: point.name,
      remark: null,
      is_graded: true,
      base_value: null,
      target_value: null,
      sewn_value: null,
      adjustment: null,
      remarks: null,
    })),
  },
  { updatedBy: UPDATED_BY }
);
if (!result.ok) throw new Error(`updateClientPatternVersion failed: ${result.error}`);
console.log(`Trial ${result.version.version} measurements replaced with ${result.version.measurements.length} shorts points.`);
