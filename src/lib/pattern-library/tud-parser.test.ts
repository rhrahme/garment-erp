import assert from "node:assert/strict";
import { test } from "node:test";
import { extractTudThumbnail, parseTudFile } from "./tud-parser.ts";

/**
 * Fixture mirrors the real TUKA header layout (trimmed to a few pieces — the
 * client's actual file is not committed): \r\n endings, NUL after `@ Begin`,
 * double-spaced fields, quoted piece names with slashes/backslashes.
 */
const HEADER = [
  "\x18",
  "@ Begin",
  "\x00",
  "/F  C:\\TUKAdata\\Sample pattern\\SHORT\\Sample Style  20.07.26.tud",
  '-U  "user"  "" ',
  "-K  StyleCaption  Sample Style  20.07.26",
  "",
  "-F  Sample_Style__20.07.26",
  "-S  2XL  1",
  "-X  2XL       SHEEL     1  11156.1877  1841.4099",
  "-X  2XL       FINISH    1    487.9308  262.7940",
  "-Y  2XL       1  14355.2533  2675.2327",
  '-P  "BACK" "C_2" ""',
  "-Q  BACK  2",
  "-M  SHEEL",
  "-E  BACK  2XL  1      0.1827  178.97",
  '-P  "FRONT" "C_2" ""',
  "-Q  FRONT  2",
  "-M  SHEEL",
  "-E  FRONT  2XL  1      0.1392  153.85",
  '-P  "D/FLY_INER" "1X1" ""',
  "-Q  D/FLY_INER  1",
  "-M  CONTASH",
  "-E  D/FLY_INER  2XL  1      0.0260   68.11",
  '-P  "S\\FLY_1" "1X1" ""',
  "-Q  S\\FLY_1  1",
  "-M  FINISH",
  "-E  S\\FLY_1  2XL  1      0.0048   34.79",
  "@",
  "",
  "@ End",
].join("\r\n");

const FAKE_JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  Buffer.from("JFIF\0", "latin1"),
  Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]),
  Buffer.from([0xff, 0xd9]),
]);

function buildFixture(header: string): Buffer {
  return Buffer.concat([
    Buffer.from(header, "latin1"),
    Buffer.from("\r\n\x00\x18\x18?Oct 31, 2017\x00", "latin1"),
    FAKE_JPEG,
    // Trailing binary geometry junk.
    Buffer.from([0x00, 0x42, 0x13, 0x00, 0x00, 0x7f, 0xfe]),
  ]);
}

test("parses header records from a real-shaped .tud buffer", () => {
  const parsed = parseTudFile(buildFixture(HEADER));
  assert.ok(parsed, "expected the fixture to parse");
  const meta = parsed.metadata;

  // Whitespace runs collapse (the CAD file name had a double space).
  assert.equal(meta.style_caption, "Sample Style 20.07.26");
  assert.equal(meta.source_path, "C:\\TUKAdata\\Sample pattern\\SHORT\\Sample Style  20.07.26.tud");
  assert.deepEqual(meta.sizes, ["2XL"]);

  assert.equal(meta.pieces.length, 4);
  assert.equal(meta.total_cut_pieces, 6);
  const back = meta.pieces.find((piece) => piece.name === "BACK");
  assert.ok(back);
  assert.equal(back.cut_quantity, 2);
  assert.equal(back.fabric, "SHEEL");
  assert.deepEqual(back.per_size["2XL"], { area_m2: 0.1827, perimeter_cm: 178.97 });

  // Quoted names with slashes and backslashes survive.
  const fly = meta.pieces.find((piece) => piece.name === "D/FLY_INER");
  assert.ok(fly);
  assert.equal(fly.fabric, "CONTASH");
  assert.ok(meta.pieces.some((piece) => piece.name === "S\\FLY_1"));
});

test("totals convert -X/-Y cm² to m²", () => {
  const parsed = parseTudFile(buildFixture(HEADER));
  assert.ok(parsed);
  const meta = parsed.metadata;

  assert.equal(meta.size_totals.length, 1);
  assert.deepEqual(meta.size_totals[0], { size: "2XL", area_m2: 1.4355, perimeter_cm: 2675.23 });
  assert.equal(meta.total_area_m2, 1.4355);
  assert.equal(meta.total_perimeter_cm, 2675.23);

  assert.equal(meta.fabric_totals.length, 2);
  const shell = meta.fabric_totals.find((total) => total.fabric === "SHEEL");
  assert.ok(shell);
  assert.equal(shell.area_m2, 1.1156);
});

test("extracts the embedded JFIF thumbnail bytes", () => {
  const buffer = buildFixture(HEADER);
  const thumbnail = extractTudThumbnail(buffer);
  assert.ok(thumbnail);
  assert.deepEqual([...thumbnail], [...FAKE_JPEG]);

  const parsed = parseTudFile(buffer);
  assert.ok(parsed?.thumbnail);
  assert.equal(parsed.thumbnail.length, FAKE_JPEG.length);
});

test("returns null for non-TUKA buffers (plain attachment fallback)", () => {
  assert.equal(parseTudFile(Buffer.from("%PDF-1.7 not a tud file")), null);
  assert.equal(parseTudFile(Buffer.from([0x00, 0x01, 0x02, 0x03])), null);
  assert.equal(extractTudThumbnail(Buffer.from("no jpeg here")), null);
});

test("handles multi-size files with repeated -S/-E records", () => {
  const multiSize = [
    "@ Begin",
    "-K  StyleCaption  Multi Size Style",
    "-S  L  1",
    "-S  XL  1",
    "-Y  L   1  10000.0  2000.0",
    "-Y  XL  1  12000.0  2200.0",
    '-P  "BACK" "C_2" ""',
    "-Q  BACK  2",
    "-M  SHEEL",
    "-E  BACK  L   1  0.4000  150.00",
    "-E  BACK  XL  1  0.5000  160.00",
    "@ End",
  ].join("\r\n");

  const parsed = parseTudFile(Buffer.from(multiSize, "latin1"));
  assert.ok(parsed);
  const meta = parsed.metadata;
  assert.deepEqual(meta.sizes, ["L", "XL"]);
  assert.equal(meta.pieces.length, 1);
  assert.deepEqual(meta.pieces[0]?.per_size, {
    L: { area_m2: 0.4, perimeter_cm: 150 },
    XL: { area_m2: 0.5, perimeter_cm: 160 },
  });
  assert.equal(meta.size_totals.length, 2);
  // Multiple sizes → no single headline total.
  assert.equal(meta.total_area_m2, null);
  assert.equal(parsed.thumbnail, null);
});

test("computes fallback totals from -E × quantity when -Y is absent", () => {
  const noTotals = [
    "@ Begin",
    "-K  StyleCaption  No Totals",
    "-S  M  1",
    '-P  "BACK" "C_2" ""',
    "-Q  BACK  2",
    "-E  BACK  M  1  0.2000  100.00",
    '-P  "FRONT" "C_1" ""',
    "-Q  FRONT  1",
    "-E  FRONT  M  1  0.1000  80.00",
    "@ End",
  ].join("\r\n");

  const parsed = parseTudFile(Buffer.from(noTotals, "latin1"));
  assert.ok(parsed);
  assert.deepEqual(parsed.metadata.size_totals, [
    { size: "M", area_m2: 0.5, perimeter_cm: 280 },
  ]);
  assert.equal(parsed.metadata.total_area_m2, 0.5);
});

test("tolerates unknown records without failing", () => {
  const withUnknown = [
    "@ Begin",
    "-Z  something unknown",
    "!! garbage line",
    "-K  StyleCaption  Tolerant Style",
    "-S  S  1",
    "@ End",
  ].join("\r\n");

  const parsed = parseTudFile(Buffer.from(withUnknown, "latin1"));
  assert.ok(parsed);
  assert.equal(parsed.metadata.style_caption, "Tolerant Style");
  assert.deepEqual(parsed.metadata.sizes, ["S"]);
});
