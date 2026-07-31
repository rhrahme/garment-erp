import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyPatternLibraryFile } from "./file-storage.ts";
import { parseTumFile } from "./tum-parser.ts";

/**
 * Minimal TUKAmrk header shaped like shop .tum files (ASCII only - no binary geometry).
 * -D: length_cm, width_cm, efficiency_pct, perimeter-like 4th field.
 */
const HEADER = [
  "@ Begin",
  "!  C:\\TUKAdata\\marker\\Sample Marker.tum",
  "-Z  MarkerCaption",
  "-D  183.252343  71.000000  78.181246  1626.498581",
  "/F  C:\\TUKAdata\\Sample\\Sample Style.tud",
  "-K  StyleCaption  Sample Style",
  "-Q  2XL           1      0",
  '-P  "FRONT" "C 2" ""',
  "-E  FRONT            2XL           1      0.2690  224.7629",
  "-G  SHEEL",
  '-P  "BACK" "C 1" ""',
  "-E  BACK             2XL           1      0.2253  208.6970",
  "-G  SHEEL",
  "@ End",
].join("\r\n");

const FAKE_JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  Buffer.from("JFIF\0", "latin1"),
  Buffer.from([0x01, 0x02, 0x03]),
  Buffer.from([0xff, 0xd9]),
]);

function buildFixture(header: string): Buffer {
  return Buffer.concat([
    Buffer.from(header, "latin1"),
    Buffer.from("\r\n\x00", "latin1"),
    FAKE_JPEG,
    Buffer.from([0x00, 0x42, 0x13]),
  ]);
}

test("classifyPatternLibraryFile maps .tum to marker", () => {
  assert.equal(classifyPatternLibraryFile("shop-marker.tum").kind, "marker");
  assert.equal(classifyPatternLibraryFile("SHOP.TUM").kind, "marker");
  assert.equal(classifyPatternLibraryFile("legacy.mrk").kind, "marker");
  assert.equal(classifyPatternLibraryFile("design.tud").kind, "tud");
});

test("parses -D metrics, pieces, and /F from a .tum header", () => {
  const parsed = parseTumFile(buildFixture(HEADER));
  assert.ok(parsed, "expected tum fixture to parse");
  const meta = parsed.metadata;

  assert.equal(meta.style_caption, "Sample Style");
  assert.equal(meta.source_path, "C:\\TUKAdata\\Sample\\Sample Style.tud");
  assert.equal(meta.marker_path, "C:\\TUKAdata\\marker\\Sample Marker.tum");
  assert.equal(meta.length_cm, 183.252);
  assert.equal(meta.width_cm, 71);
  assert.equal(meta.efficiency_pct, 78.181);
  assert.equal(meta.perimeter_cm, 1626.499);
  assert.equal(meta.size, "2XL");
  assert.equal(meta.garment_qty, 1);
  assert.equal(meta.pieces.length, 2);
  assert.equal(meta.total_cut_pieces, 2);

  const front = meta.pieces.find((piece) => piece.name === "FRONT");
  assert.ok(front);
  assert.equal(front.code, "C 2");
  assert.equal(front.fabric, "SHEEL");
  assert.equal(front.cut_quantity, 1);
  assert.equal(front.area_m2, 0.269);
  assert.equal(front.perimeter_cm, 224.7629);
});

test("extracts embedded JPEG thumbnail from .tum", () => {
  const parsed = parseTumFile(buildFixture(HEADER));
  assert.ok(parsed?.thumbnail);
  assert.deepEqual([...parsed.thumbnail], [...FAKE_JPEG]);
});

test("returns null for non-marker buffers", () => {
  assert.equal(parseTumFile(Buffer.from("%PDF-1.7")), null);
  assert.equal(parseTumFile(Buffer.from([0x00, 0x01, 0x02])), null);
});
