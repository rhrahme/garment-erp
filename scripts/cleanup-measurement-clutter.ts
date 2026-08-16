/**
 * One-off repair (Aug 16 2026): library-wide measurement clutter cleanup.
 *
 * 1. All-empty sheets on garments that offer a Reduced template (Trouser,
 *    Overshirt+Trouser, ...) are rebuilt to the reduced row set - they were
 *    created with the "entire" template before reduced became the default
 *    (57-row empty Trouser sheets etc.). Zero data loss: only versions with
 *    NO entered value anywhere are touched.
 * 2. Rows whose point_id exists in the dictionary under a different name AND
 *    whose current label collides with another row in the same version are
 *    relabeled to the dictionary name (value kept) - resolves mislabeled
 *    imports like back-pocket-opening-length named "Side pocket opening
 *    length".
 * 3. Remaining EMPTY rows whose normalized label duplicates a kept row are
 *    dropped.
 * Same-id rows that are BOTH filled are left alone and reported (humans must
 * pick the right value).
 *
 * Run: node --experimental-strip-types --experimental-loader ./scripts/tsconfig-paths-loader.mjs scripts/cleanup-measurement-clutter.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import {
  buildReducedMeasurementsFromTemplate,
  garmentOffersReducedMeasurementTemplate,
  normalizeMeasurementRowLabel,
} from "@/lib/pattern-library/measurement-template-mode";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

type Row = {
  point_id: string;
  name?: string | null;
  base_value?: number | null;
  target_value?: number | null;
  sewn_value?: number | null;
  adjustment?: number | null;
  remark?: string | null;
  remarks?: string | null;
};

const rowFilled = (r: Row) =>
  (r.base_value != null && r.base_value !== 0) ||
  r.target_value != null ||
  r.sewn_value != null ||
  r.adjustment != null ||
  Boolean(r.remark?.trim()) ||
  Boolean(r.remarks?.trim());

const { data } = await sb.from("erp_documents").select("data").eq("id", "pattern_library").maybeSingle();
if (!data) throw new Error("pattern_library not found");
const store = data.data;
const patterns = store.client_patterns ?? [];
const dictByName = new Map<string, string>();
const dictById = new Map<string, string>(
  (store.dictionary ?? []).map((p: { id: string; name: string }) => [p.id, p.name])
);
void dictByName;

writeFileSync(
  "tmp-pdf-inspect/backup-pattern-library-before-clutter-sweep.json",
  JSON.stringify(store, null, 1)
);
console.log("full backup written");

let rebuilt = 0;
let relabeled = 0;
let droppedEmpty = 0;
const unresolved: string[] = [];

for (const cp of patterns) {
  const garment = String(cp.garment_type ?? "");
  for (const v of cp.versions ?? []) {
    let rows: Row[] = v.measurements ?? [];
    if (rows.length === 0) continue;

    // 1. all-empty bloat on reduced-capable garments -> reduced rebuild
    if (
      rows.length > 20 &&
      !rows.some(rowFilled) &&
      garmentOffersReducedMeasurementTemplate(garment)
    ) {
      const reduced = buildReducedMeasurementsFromTemplate(store.dictionary ?? [], garment);
      console.log("REBUILD", cp.id, "|", cp.client_name, "|", garment, "| v" + v.version, ":", rows.length, "->", reduced.length, "rows");
      v.measurements = reduced;
      rebuilt++;
      continue;
    }

    // label collision map
    const labelCount = () => {
      const m = new Map<string, number>();
      for (const r of rows) {
        const l = normalizeMeasurementRowLabel(r.name);
        if (l) m.set(l, (m.get(l) ?? 0) + 1);
      }
      return m;
    };

    // 2. relabel mislabeled dictionary ids when that resolves a collision
    let counts = labelCount();
    for (const r of rows) {
      const label = normalizeMeasurementRowLabel(r.name);
      if (!label || (counts.get(label) ?? 0) < 2) continue;
      const dictName = dictById.get(r.point_id);
      if (!dictName) continue;
      const dictLabel = normalizeMeasurementRowLabel(dictName);
      if (dictLabel === label) continue;
      // only relabel if the dictionary label is free in this version
      if ((counts.get(dictLabel) ?? 0) > 0) continue;
      console.log("RELABEL", cp.id, "| v" + v.version, "|", r.point_id, ":", JSON.stringify(r.name), "->", JSON.stringify(dictName), rowFilled(r) ? "(filled)" : "(empty)");
      r.name = dictName;
      relabeled++;
      counts = labelCount();
    }

    // 3. drop EMPTY rows still colliding with a kept row
    counts = labelCount();
    const kept: Row[] = [];
    const keptLabels = new Set<string>();
    for (const r of rows) {
      const label = normalizeMeasurementRowLabel(r.name);
      if (label && (counts.get(label) ?? 0) > 1 && keptLabels.has(label) && !rowFilled(r)) {
        console.log("DROP-EMPTY", cp.id, "| v" + v.version, "|", r.point_id, JSON.stringify(r.name));
        droppedEmpty++;
        continue;
      }
      // keep filled dups (reported below)
      if (label && keptLabels.has(label) && rowFilled(r)) {
        unresolved.push(`${cp.id} (${cp.client_name} ${garment}) v${v.version}: "${r.name}" on ${r.point_id}`);
      }
      kept.push(r);
      if (label) keptLabels.add(label);
    }
    // ensure a filled dup was not shadowed by an earlier EMPTY same-label row
    v.measurements = kept;
    rows = kept;
  }
}

console.log("\nrebuilt versions:", rebuilt, "| relabeled rows:", relabeled, "| dropped empty dups:", droppedEmpty);
console.log("unresolved filled duplicates (left untouched):");
for (const u of unresolved) console.log("  -", u);

const w = await sb
  .from("erp_documents")
  .update({ data: store, updated_at: new Date().toISOString() })
  .eq("id", "pattern_library");
if (w.error) throw w.error;
console.log("pattern_library saved");
