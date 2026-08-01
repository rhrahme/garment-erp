import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCutterPlanForClientPattern,
  buildCutterPlanFromTud,
  flattenCutterPlan,
} from "./tud-cutter-plan.ts";
import { parseTudFile } from "./tud-parser.ts";
import type { ClientPattern, PatternLibraryAttachment } from "@/lib/types/pattern-library";

const HEADER = [
  "@ Begin",
  "/F  C:\\TUKAdata\\Shirt\\Ajlan Cotton Shirt Final.tud",
  "-K  StyleCaption  Ajlan Cotton Shirt Final",
  "-F  Ajlan_Cotton_Shirt_Final",
  "-S  M  1",
  "-X  M         SHEEL     1  13493.7173  1621.5273",
  "-X  M         LINING    1    368.0679  189.8496",
  "-Y  M         1  13861.7853  1811.3770",
  '-P  "CUFF" "C_4" ""',
  "-Q  CUFF  4",
  "-M  SHEEL",
  "-E  CUFF  M  1      0.0200   69.40",
  '-P  "FRONT_1" "C_2" ""',
  "-Q  FRONT_1  2",
  "-M  SHEEL",
  "-E  FRONT_1  M  1      0.2433  213.79",
  '-P  "COLLAR_FINISH" "C_1" ""',
  "-Q  COLLAR_FINISH  1",
  "-M  LINING",
  "-E  COLLAR_FINISH  M  1      0.0194   92.08",
  "@ End",
].join("\r\n");

describe("tud-cutter-plan", () => {
  it("reads TUD header codes and builds cutter piece plan", () => {
    const parsed = parseTudFile(Buffer.from(HEADER, "latin1"));
    assert.ok(parsed);
    assert.equal(parsed.metadata.style_file, "Ajlan_Cotton_Shirt_Final");
    const front = parsed.metadata.pieces.find((p) => p.name === "FRONT_1");
    assert.equal(front?.code, "C_2");
    assert.equal(parsed.metadata.pieces.find((p) => p.name === "CUFF")?.code, "C_4");

    const plan = buildCutterPlanFromTud(parsed.metadata, { size: "M", double_fold: true });
    assert.ok(plan);
    assert.equal(plan!.size, "M");
    assert.equal(plan!.total_cut_pieces, 7);
    assert.ok(plan!.shell_pieces.length >= 2);
    assert.ok(plan!.other_pieces.some((p) => p.name === "COLLAR_FINISH"));
    const cuff = flattenCutterPlan(plan!).find((p) => p.name === "CUFF");
    assert.ok(cuff);
    assert.equal(cuff!.cut_quantity, 4);
    assert.equal(cuff!.fabric_role, "shell");
    assert.ok(cuff!.approx_width_cm > 0);
    assert.ok(cuff!.approx_height_cm > 0);
    assert.match(cuff!.place_hint, /fold/i);
    assert.match(plan!.other_pieces[0]!.place_hint, /Lining/i);
  });

  it("keeps Overshirt+Trouser BACK qtys separate (no name-merge double)", () => {
    const overshirtTud = {
      style_caption: "Overshirt",
      source_path: null,
      sizes: ["RE-XXL"],
      pieces: [
        {
          name: "BACK",
          cut_quantity: 2,
          fabric: "SHEEL",
          per_size: { "RE-XXL": { area_m2: 0.2, perimeter_cm: 180 } },
        },
        {
          name: "FRONT_1",
          cut_quantity: 2,
          fabric: "SHEEL",
          per_size: { "RE-XXL": { area_m2: 0.25, perimeter_cm: 200 } },
        },
      ],
      total_cut_pieces: 4,
      fabric_totals: [],
      size_totals: [{ size: "RE-XXL", area_m2: 0.9, perimeter_cm: 760 }],
      total_area_m2: 0.9,
      total_perimeter_cm: 760,
    };
    const trouserTud = {
      style_caption: "Trouser",
      source_path: null,
      sizes: ["48"],
      pieces: [
        {
          name: "BACK",
          cut_quantity: 2,
          fabric: "SHEEL",
          per_size: { "48": { area_m2: 0.3, perimeter_cm: 250 } },
        },
        {
          name: "FRONT",
          cut_quantity: 2,
          fabric: "SHEEL",
          per_size: { "48": { area_m2: 0.28, perimeter_cm: 240 } },
        },
      ],
      total_cut_pieces: 4,
      fabric_totals: [],
      size_totals: [{ size: "48", area_m2: 1.16, perimeter_cm: 980 }],
      total_area_m2: 1.16,
      total_perimeter_cm: 980,
    };

    const file = (
      id: string,
      pieceName: string,
      tud: typeof overshirtTud
    ): PatternLibraryAttachment => ({
      id,
      kind: "tud",
      filename: `${id}.tud`,
      stored_filename: `${id}.tud`,
      content_type: "application/octet-stream",
      size_bytes: 10,
      uploaded_at: "2026-01-01T00:00:00.000Z",
      uploaded_by: "test",
      piece_name: pieceName,
      tud,
    });

    const pattern = {
      id: "cp-ot",
      pattern_ref: "FR-OT",
      client_id: "c1",
      client_code: "FR-1",
      client_name: "Test",
      garment_type: "Overshirt+Trouser",
      description: null,
      base_pattern_id: null,
      base_size: "RE-XXL",
      house_brand_id: null,
      house_brand_code: null,
      fabric: null,
      unit: "cm",
      versions: [],
      final_version_id: null,
      special_instructions: null,
      physical_pattern_kept: false,
      physical_pattern_location: null,
      files: [
        file("tud-os", "Overshirt", overshirtTud),
        file("tud-tr", "Trouser", trouserTud),
      ],
      active_tud_by_piece: { Overshirt: "tud-os", Trouser: "tud-tr" },
      notes: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    } as ClientPattern;

    const plan = buildCutterPlanForClientPattern(pattern, {
      size: "RE-XXL",
      double_fold: true,
    });
    assert.ok(plan);
    assert.equal(plan!.total_cut_pieces, 8);
    assert.match(plan!.size, /RE-XXL/);
    assert.match(plan!.size, /48/);
    const rows = flattenCutterPlan(plan!);
    assert.equal(rows.find((r) => r.name === "Overshirt: BACK")?.cut_quantity, 2);
    assert.equal(rows.find((r) => r.name === "Trouser: BACK")?.cut_quantity, 2);
    assert.ok(rows.some((r) => r.name === "Trouser: FRONT"));
    assert.equal(
      rows.filter((r) => r.name === "BACK" || r.name.endsWith(": BACK")).reduce(
        (sum, r) => sum + r.cut_quantity,
        0
      ),
      4
    );
  });
});
