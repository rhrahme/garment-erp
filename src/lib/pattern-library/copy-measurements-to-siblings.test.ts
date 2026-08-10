import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyCopyMeasurementsToPattern,
  copyWouldLoseFilledValues,
  listCopyMeasurementSiblings,
  normalizeCopyMeasurementsPieceScope,
  sharedCopyPieces,
} from "@/lib/pattern-library/copy-measurements-to-siblings";
import type {
  ClientPattern,
  ClientPatternMeasurement,
} from "@/lib/types/pattern-library";

type Row = Partial<ClientPatternMeasurement> & { point_id: string };

function rows(list: Array<[string, string, number | null]>): ClientPatternMeasurement[] {
  return list.map(
    ([pointId, name, target]) =>
      ({
        point_id: pointId,
        name,
        base_value: null,
        target_value: target,
        sewn_value: null,
      }) as ClientPatternMeasurement
  );
}

function pattern(
  id: string,
  garment: string,
  measurements: ClientPatternMeasurement[],
  unit: "cm" | "in" = "cm"
): ClientPattern {
  return {
    id,
    pattern_ref: id,
    client_id: "client-1",
    garment_type: garment,
    unit,
    final_version_id: null,
    special_instructions: null,
    versions: [
      {
        id: `${id}-v1`,
        version: 1,
        measurements,
        special_instructions: null,
        notes: null,
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-01T00:00:00Z",
      },
    ],
  } as unknown as ClientPattern;
}

function targetOf(result: ClientPattern | null, pointId: string): number | null | undefined {
  const version = result?.versions[result.versions.length - 1];
  return version?.measurements?.find((row: Row) => row.point_id === pointId)?.target_value;
}

// -------------------------------------------------- overwrite must not blank

test("overwrite copies filled values but never blanks a filled target (Khaled OT waist regression)", () => {
  const source = pattern(
    "src",
    "Overshirt",
    rows([
      ["total-length-hnp", "Total Length", 76],
      ["1-2-chest", "1/2 Chest", 63],
      ["1-2-waist", "1/2 Waist", null], // empty at source
    ])
  );
  const target = pattern(
    "tgt",
    "Overshirt",
    rows([
      ["total-length-hnp", "Total Length", 78],
      ["1-2-chest", "1/2 Chest", 63.2],
      ["1-2-waist", "1/2 Waist", 60.5], // filled at target - must survive
    ])
  );

  const out = applyCopyMeasurementsToPattern(target, source, "overwrite", {});
  assert.ok(out);
  assert.equal(targetOf(out, "total-length-hnp"), 76);
  assert.equal(targetOf(out, "1-2-chest"), 63);
  assert.equal(targetOf(out, "1-2-waist"), 60.5);
  assert.equal(copyWouldLoseFilledValues(target, out!), null);
});

test("overwrite adds source-only points and keeps target-only points", () => {
  const source = pattern("src", "Overshirt", rows([["bicep", "Bicep", 23.5]]));
  const target = pattern("tgt", "Overshirt", rows([["elbow", "Elbow", 19]]));

  const out = applyCopyMeasurementsToPattern(target, source, "overwrite", {});
  assert.ok(out);
  assert.equal(targetOf(out, "bicep"), 23.5);
  assert.equal(targetOf(out, "elbow"), 19);
});

test("overwrite copies the source unit", () => {
  const source = pattern("src", "Trouser", rows([["inseam-length", "Inseam", 29]]), "in");
  const target = pattern("tgt", "Trouser", rows([["inseam-length", "Inseam", 74]]), "cm");

  const out = applyCopyMeasurementsToPattern(target, source, "overwrite", {});
  assert.ok(out);
  assert.equal(out!.unit, "in");
  assert.equal(targetOf(out, "inseam-length"), 29);
});

// ------------------------------------------------------------ fill empty only

test("fill_empty_only skips a target sheet that already has sizes", () => {
  const source = pattern("src", "Overshirt", rows([["1-2-chest", "1/2 Chest", 63]]));
  const target = pattern("tgt", "Overshirt", rows([["1-2-chest", "1/2 Chest", 61]]));

  const out = applyCopyMeasurementsToPattern(target, source, "fill_empty_only", {});
  assert.equal(out, null);
});

test("fill_empty_only fills a fully empty sheet", () => {
  const source = pattern("src", "Overshirt", rows([["1-2-chest", "1/2 Chest", 63]]));
  const target = pattern("tgt", "Overshirt", rows([["1-2-chest", "1/2 Chest", null]]));

  const out = applyCopyMeasurementsToPattern(target, source, "fill_empty_only", {});
  assert.ok(out);
  assert.equal(targetOf(out, "1-2-chest"), 63);
});

// ---------------------------------------------------------------- piece scope

const OT_DICTIONARY = [
  { id: "1-2-chest", name: "1/2 Chest", garment_types: ["Overshirt"] },
  { id: "slv-length", name: "Slv Length", garment_types: ["Overshirt"] },
  { id: "inseam-length", name: "Inseam Length", garment_types: ["Trouser"] },
  { id: "fly-length", name: "Fly Length", garment_types: ["Trouser"] },
];

test("piece scope copies only that piece and leaves the other piece untouched", () => {
  const source = pattern(
    "src",
    "Overshirt+Trouser",
    rows([
      ["1-2-chest", "1/2 Chest", 63],
      ["slv-length", "Slv Length", 66.5],
      ["inseam-length", "Inseam Length", 73],
      ["fly-length", "Fly Length", 18],
    ])
  );
  const target = pattern(
    "tgt",
    "Overshirt+Trouser",
    rows([
      ["1-2-chest", "1/2 Chest", 60],
      ["slv-length", "Slv Length", null],
      ["inseam-length", "Inseam Length", 70],
      ["fly-length", "Fly Length", 17],
    ])
  );

  const out = applyCopyMeasurementsToPattern(target, source, "overwrite", {
    pieceScope: "Overshirt",
    dictionary: OT_DICTIONARY,
  });
  assert.ok(out);
  // Overshirt rows follow the source.
  assert.equal(targetOf(out, "1-2-chest"), 63);
  assert.equal(targetOf(out, "slv-length"), 66.5);
  // Trouser rows keep the target's own values.
  assert.equal(targetOf(out, "inseam-length"), 70);
  assert.equal(targetOf(out, "fly-length"), 17);
});

test("piece scope with empty source row keeps the target's filled value", () => {
  const source = pattern(
    "src",
    "Overshirt+Trouser",
    rows([
      ["1-2-chest", "1/2 Chest", 63],
      ["slv-length", "Slv Length", null], // empty at source
    ])
  );
  const target = pattern(
    "tgt",
    "Overshirt+Trouser",
    rows([
      ["1-2-chest", "1/2 Chest", 60],
      ["slv-length", "Slv Length", 65], // filled at target - must survive
    ])
  );

  const out = applyCopyMeasurementsToPattern(target, source, "overwrite", {
    pieceScope: "Overshirt",
    dictionary: OT_DICTIONARY,
  });
  assert.ok(out);
  assert.equal(targetOf(out, "1-2-chest"), 63);
  assert.equal(targetOf(out, "slv-length"), 65);
  assert.equal(copyWouldLoseFilledValues(target, out!), null);
});

test("piece scope returns null when the source piece has no filled sizes", () => {
  const source = pattern(
    "src",
    "Overshirt+Trouser",
    rows([
      ["1-2-chest", "1/2 Chest", null],
      ["inseam-length", "Inseam Length", 73],
    ])
  );
  const target = pattern(
    "tgt",
    "Overshirt+Trouser",
    rows([["1-2-chest", "1/2 Chest", 60]])
  );

  const out = applyCopyMeasurementsToPattern(target, source, "overwrite", {
    pieceScope: "Overshirt",
    dictionary: OT_DICTIONARY,
  });
  assert.equal(out, null);
});

// ------------------------------------------------------- loss detection guard

test("copyWouldLoseFilledValues flags a blanked value even when another point gains one", () => {
  const before = pattern(
    "p",
    "Overshirt",
    rows([
      ["1-2-waist", "1/2 Waist", 60.5],
      ["1-2-chest", "1/2 Chest", null],
    ])
  );
  const after = pattern(
    "p",
    "Overshirt",
    rows([
      ["1-2-waist", "1/2 Waist", null], // lost
      ["1-2-chest", "1/2 Chest", 63], // gained - must not mask the loss
    ])
  );
  after.versions[0]!.id = before.versions[0]!.id;

  const loss = copyWouldLoseFilledValues(before, after);
  assert.ok(loss);
  assert.equal(loss!.lost, 1);
});

test("copyWouldLoseFilledValues passes when every filled point survives", () => {
  const before = pattern("p", "Overshirt", rows([["1-2-waist", "1/2 Waist", 60.5]]));
  const after = pattern(
    "p",
    "Overshirt",
    rows([
      ["1-2-waist", "1/2 Waist", 61], // changed, still filled
      ["1-2-chest", "1/2 Chest", 63], // added
    ])
  );
  after.versions[0]!.id = before.versions[0]!.id;

  assert.equal(copyWouldLoseFilledValues(before, after), null);
});

test("copyWouldLoseFilledValues flags a dropped version", () => {
  const before = pattern("p", "Overshirt", rows([["1-2-waist", "1/2 Waist", 60.5]]));
  const after = { ...before, versions: [] } as unknown as ClientPattern;

  const loss = copyWouldLoseFilledValues(before, after);
  assert.ok(loss);
});

// -------------------------------------------- cross garment (OT -> Overshirt)

test("sharedCopyPieces finds the overlap between garments", () => {
  assert.deepEqual(sharedCopyPieces("Overshirt+Trouser", "Overshirt"), ["Overshirt"]);
  assert.deepEqual(sharedCopyPieces("Overshirt+Trouser", "Trouser"), ["Trouser"]);
  assert.deepEqual(sharedCopyPieces("Overshirt", "Overshirt+Trouser"), ["Overshirt"]);
  assert.deepEqual(sharedCopyPieces("Overshirt+Trouser", "Shirt LS"), []);
});

test("OT source copies its Overshirt sizes onto an Overshirt-only sheet", () => {
  const source = pattern(
    "src-ot",
    "Overshirt+Trouser",
    rows([
      ["1-2-chest", "1/2 Chest", 63],
      ["slv-length", "Slv Length", 66.5],
      ["inseam-length", "Inseam Length", 73],
    ])
  );
  const target = pattern(
    "tgt-os",
    "Overshirt",
    rows([
      ["1-2-chest", "1/2 Chest", 60],
      ["slv-length", "Slv Length", null],
    ])
  );

  const out = applyCopyMeasurementsToPattern(target, source, "overwrite", {
    pieceScope: "Overshirt",
    dictionary: OT_DICTIONARY,
  });
  assert.ok(out);
  assert.equal(targetOf(out, "1-2-chest"), 63);
  assert.equal(targetOf(out, "slv-length"), 66.5);
  // Trouser rows must not leak onto an Overshirt-only sheet.
  assert.equal(targetOf(out, "inseam-length"), undefined);
  assert.equal(copyWouldLoseFilledValues(target, out!), null);
});

test("OT source with Both scope still copies only the shared piece to an Overshirt sheet", () => {
  const source = pattern(
    "src-ot",
    "Overshirt+Trouser",
    rows([
      ["1-2-chest", "1/2 Chest", 63],
      ["inseam-length", "Inseam Length", 73],
    ])
  );
  const target = pattern("tgt-os", "Overshirt", rows([["1-2-chest", "1/2 Chest", null]]));

  const out = applyCopyMeasurementsToPattern(target, source, "overwrite", {
    pieceScope: "all",
    dictionary: OT_DICTIONARY,
  });
  assert.ok(out);
  assert.equal(targetOf(out, "1-2-chest"), 63);
  assert.equal(targetOf(out, "inseam-length"), undefined);
});

test("OT source with Trouser scope skips an Overshirt-only target", () => {
  const source = pattern(
    "src-ot",
    "Overshirt+Trouser",
    rows([
      ["1-2-chest", "1/2 Chest", 63],
      ["inseam-length", "Inseam Length", 73],
    ])
  );
  const target = pattern("tgt-os", "Overshirt", rows([["1-2-chest", "1/2 Chest", null]]));

  const out = applyCopyMeasurementsToPattern(target, source, "overwrite", {
    pieceScope: "Trouser",
    dictionary: OT_DICTIONARY,
  });
  assert.equal(out, null);
});

test("Overshirt-only source copies onto the Overshirt piece of an OT sheet", () => {
  const source = pattern(
    "src-os",
    "Overshirt",
    rows([
      ["1-2-chest", "1/2 Chest", 63],
      ["slv-length", "Slv Length", 66.5],
    ])
  );
  const target = pattern(
    "tgt-ot",
    "Overshirt+Trouser",
    rows([
      ["1-2-chest", "1/2 Chest", null],
      ["inseam-length", "Inseam Length", 70],
    ])
  );

  const out = applyCopyMeasurementsToPattern(target, source, "overwrite", {
    pieceScope: "all",
    dictionary: OT_DICTIONARY,
  });
  assert.ok(out);
  assert.equal(targetOf(out, "1-2-chest"), 63);
  assert.equal(targetOf(out, "slv-length"), 66.5);
  // Target's trouser values untouched.
  assert.equal(targetOf(out, "inseam-length"), 70);
});

test("listCopyMeasurementSiblings includes cross-garment piece matches after same-garment ones", () => {
  const source = pattern("src-ot", "Overshirt+Trouser", rows([["1-2-chest", "1/2 Chest", 63]]));
  const sameGarment = pattern("sib-ot", "Overshirt+Trouser", rows([]));
  const crossGarment = pattern("sib-os", "Overshirt", rows([]));
  const unrelated = pattern("sib-shirt", "Shirt LS", rows([]));
  const otherClient = {
    ...pattern("other-os", "Overshirt", rows([])),
    client_id: "client-2",
  } as unknown as ClientPattern;

  const siblings = listCopyMeasurementSiblings(
    [source, sameGarment, crossGarment, unrelated, otherClient],
    source
  );
  assert.deepEqual(
    siblings.map((row) => [row.id, row.is_cross_garment]),
    [
      ["sib-ot", false],
      ["sib-os", true],
    ]
  );
  assert.deepEqual(siblings[1]!.shared_pieces, ["Overshirt"]);
});

// ------------------------------------------------------------------- comments

function withComments(p: ClientPattern, comments: string | null): ClientPattern {
  const next = p as unknown as { special_instructions: string | null; versions: Array<{ special_instructions: string | null }> };
  next.special_instructions = comments;
  next.versions[0]!.special_instructions = comments;
  return p;
}

test("comments copy with the sizes on piece-scoped and cross-garment copies", () => {
  const source = withComments(
    pattern("src", "Overshirt+Trouser", rows([["1-2-chest", "1/2 Chest", 63]])),
    "Shorter 2cm / Neck in waist"
  );
  const targetPiece = withComments(
    pattern("tgt-a", "Overshirt+Trouser", rows([["1-2-chest", "1/2 Chest", 60]])),
    "old note"
  );
  const targetCross = withComments(
    pattern("tgt-b", "Overshirt", rows([["1-2-chest", "1/2 Chest", 60]])),
    null
  );

  const outPiece = applyCopyMeasurementsToPattern(targetPiece, source, "overwrite", {
    pieceScope: "Overshirt",
    dictionary: OT_DICTIONARY,
  });
  assert.equal(outPiece!.special_instructions, "Shorter 2cm / Neck in waist");
  assert.equal(outPiece!.versions[0]!.special_instructions, "Shorter 2cm / Neck in waist");

  const outCross = applyCopyMeasurementsToPattern(targetCross, source, "overwrite", {
    pieceScope: "Overshirt",
    dictionary: OT_DICTIONARY,
  });
  assert.equal(outCross!.special_instructions, "Shorter 2cm / Neck in waist");
});

test("a source without comments never blanks the target's comments", () => {
  const source = withComments(
    pattern("src", "Overshirt", rows([["1-2-chest", "1/2 Chest", 63]])),
    null
  );
  const target = withComments(
    pattern("tgt", "Overshirt", rows([["1-2-chest", "1/2 Chest", 60]])),
    "keep me"
  );

  const out = applyCopyMeasurementsToPattern(target, source, "overwrite", {});
  assert.equal(out!.special_instructions, "keep me");
  assert.equal(out!.versions[0]!.special_instructions, "keep me");
});

test("fill_empty_only keeps existing target comments", () => {
  const source = withComments(
    pattern("src", "Overshirt", rows([["1-2-chest", "1/2 Chest", 63]])),
    "source note"
  );
  const target = withComments(
    pattern("tgt", "Overshirt", rows([["1-2-chest", "1/2 Chest", null]])),
    "target note"
  );

  const out = applyCopyMeasurementsToPattern(target, source, "fill_empty_only", {});
  assert.equal(out!.special_instructions, "target note");
});

// ----------------------------------------------------------------- piece norm

test("normalizeCopyMeasurementsPieceScope maps Both/unknown to all and matches pieces", () => {
  assert.equal(normalizeCopyMeasurementsPieceScope("Overshirt+Trouser", "Both"), "all");
  assert.equal(normalizeCopyMeasurementsPieceScope("Overshirt+Trouser", "trouser"), "Trouser");
  assert.equal(normalizeCopyMeasurementsPieceScope("Overshirt+Trouser", "nonsense"), "all");
  assert.equal(normalizeCopyMeasurementsPieceScope("Shirt LS", "Shirt LS"), "all");
});
