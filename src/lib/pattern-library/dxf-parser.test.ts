import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  outlinePointsForPlacement,
  parseDxfEntities,
  parseDxfFile,
} from "./dxf-parser.ts";
import { parseRulFile } from "./rul-parser.ts";
import { estimateNestFromDxf } from "./nest-estimate.ts";

/** Minimal TUKA-style DXF with two named pieces. */
const MINI_DXF = [
  "0",
  "SECTION",
  "2",
  "BLOCKS",
  "0",
  "BLOCK",
  "2",
  "1",
  "0",
  "TEXT",
  "1",
  "Piece Name: FRONT",
  "0",
  "TEXT",
  "1",
  "Quantity: 2",
  "0",
  "TEXT",
  "1",
  "Size: 46",
  "0",
  "TEXT",
  "1",
  "SHEEL: SHEEL",
  "0",
  "POLYLINE",
  "66",
  "1",
  "0",
  "VERTEX",
  "10",
  "0",
  "20",
  "0",
  "0",
  "VERTEX",
  "10",
  "400",
  "20",
  "0",
  "0",
  "VERTEX",
  "10",
  "400",
  "20",
  "200",
  "0",
  "VERTEX",
  "10",
  "0",
  "20",
  "200",
  "0",
  "VERTEX",
  "10",
  "0",
  "20",
  "0",
  "0",
  "SEQEND",
  "0",
  "ENDBLK",
  "0",
  "BLOCK",
  "2",
  "2",
  "0",
  "TEXT",
  "1",
  "Piece Name: BACK",
  "0",
  "TEXT",
  "1",
  "Quantity: 1",
  "0",
  "TEXT",
  "1",
  "Size: 46",
  "0",
  "TEXT",
  "1",
  "SHEEL: SHEEL",
  "0",
  "LWPOLYLINE",
  "90",
  "4",
  "10",
  "0",
  "20",
  "0",
  "10",
  "300",
  "20",
  "0",
  "10",
  "300",
  "20",
  "250",
  "10",
  "0",
  "20",
  "250",
  "0",
  "ENDBLK",
  "0",
  "TEXT",
  "1",
  "Style Name: Mini Jacket",
  "0",
  "TEXT",
  "1",
  "Units: METRIC",
  "0",
  "ENDSEC",
  "0",
  "EOF",
  "",
].join("\r\n");

const MINI_RUL = [
  "ANSI/AAMA VERSION: 2.1.1",
  "UNITS: METRIC",
  "GRADE RULE TABLE: Mini Jacket",
  "NUMBER OF SIZES: 1",
  "SIZE LIST:  46",
  "SAMPLE SIZE: 46",
  "END",
  "",
].join("\r\n");

describe("parseDxfFile", () => {
  it("extracts named closed outlines from POLYLINE and LWPOLYLINE", () => {
    const parsed = parseDxfFile(Buffer.from(MINI_DXF, "utf8"));
    assert.ok(parsed);
    assert.equal(parsed.metadata.pieces.length, 2);
    assert.equal(parsed.metadata.style_caption, "Mini Jacket");
    assert.equal(parsed.metadata.units, "mm");
    assert.deepEqual(parsed.metadata.sizes, ["46"]);

    const front = parsed.metadata.pieces.find((p) => p.name === "FRONT");
    assert.ok(front);
    assert.equal(front.cut_quantity, 2);
    assert.equal(front.fabric, "SHEEL");
    assert.equal(front.width_cm, 40);
    assert.equal(front.height_cm, 20);
    assert.ok(front.outline_cm.length >= 4);
    assert.ok(front.area_m2 > 0);

    const back = parsed.metadata.pieces.find((p) => p.name === "BACK");
    assert.ok(back);
    assert.equal(back.width_cm, 30);
    assert.equal(back.height_cm, 25);
  });

  it("parses entity stream", () => {
    const entities = parseDxfEntities(MINI_DXF);
    assert.ok(entities.some((e) => e.type === "POLYLINE"));
    assert.ok(entities.some((e) => e.type === "LWPOLYLINE"));
  });
});

describe("parseRulFile", () => {
  it("reads size list from grade-rule header", () => {
    const rul = parseRulFile(Buffer.from(MINI_RUL, "utf8"));
    assert.ok(rul);
    assert.deepEqual(rul.sizes, ["46"]);
    assert.equal(rul.sample_size, "46");
    assert.equal(rul.grade_rule_table, "Mini Jacket");
  });
});

describe("outlinePointsForPlacement", () => {
  it("rotates canonical outline 90 deg CW when placement.rotated", () => {
    const outline = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 4 },
      { x: 0, y: 4 },
    ];
    const rotated = outlinePointsForPlacement(outline, {
      width_cm: 4,
      height_cm: 10,
      rotated: true,
    }, 10);
    assert.ok(rotated);
    assert.deepEqual(rotated[0], { x: 0, y: 10 });
    assert.deepEqual(rotated[1], { x: 0, y: 0 });
  });
});

describe("estimateNestFromDxf", () => {
  it("packs DXF outlines onto fabric width", () => {
    const parsed = parseDxfFile(Buffer.from(MINI_DXF, "utf8"));
    assert.ok(parsed);
    const nest = estimateNestFromDxf({
      dxf: parsed.metadata,
      fabric_width_cm: 150,
      double_fold: true,
      garment_qty: 1,
    });
    assert.ok(nest);
    assert.equal(nest.has_dxf_outlines, true);
    // FRONT x2 + BACK x1
    assert.equal(nest.placements.length, 3);
    assert.ok(nest.placements.every((p) => (p.outline_cm?.length ?? 0) >= 3));
    assert.ok(nest.packed_length_m > 0);
  });
});

describe("real Youssef jacket DXF (optional)", () => {
  const realPath = path.join(
    process.env.HOME ?? "",
    "Downloads",
    "Youssef Al Rashed Jacket 25.06.26.dxf"
  );
  const realRul = path.join(
    process.env.HOME ?? "",
    "Downloads",
    "Youssef Al Rashed Jacket 25.06.26.rul"
  );

  it("extracts 22 named pieces from shop DXF when present", () => {
    let buf: Buffer;
    try {
      buf = readFileSync(realPath);
    } catch {
      // Skip when the local Downloads file is not available (CI).
      return;
    }
    const parsed = parseDxfFile(buf);
    assert.ok(parsed);
    assert.equal(parsed.metadata.pieces.length, 22);
    assert.ok(parsed.metadata.pieces.some((p) => p.name === "BACK J"));
    assert.ok(parsed.metadata.pieces.some((p) => p.name === "FRONT J"));
    assert.deepEqual(parsed.metadata.sizes, ["46"]);
    for (const piece of parsed.metadata.pieces) {
      assert.ok(piece.outline_cm.length >= 3, piece.name);
      assert.ok(piece.width_cm > 0, piece.name);
    }

    const nest = estimateNestFromDxf({
      dxf: parsed.metadata,
      fabric_width_cm: 150,
      double_fold: true,
      garment_qty: 1,
    });
    assert.ok(nest);
    assert.ok(nest.placements.length >= 22);
    assert.equal(nest.has_dxf_outlines, true);
  });

  it("parses companion RUL size list when present", () => {
    let buf: Buffer;
    try {
      buf = readFileSync(realRul);
    } catch {
      return;
    }
    const rul = parseRulFile(buf);
    assert.ok(rul);
    assert.deepEqual(rul.sizes, ["46"]);
  });
});
