import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fabricWidthsMatch,
  findPreviousMeters,
  suggestMetersIfEmpty,
} from "@/lib/sales-orders/previous-meters";

describe("fabricWidthsMatch", () => {
  it("matches equal width_cm", () => {
    assert.equal(fabricWidthsMatch({ width_cm: 150 }, { width_cm: 150 }), true);
    assert.equal(fabricWidthsMatch({ width_cm: 150 }, { width_cm: 140 }), false);
  });

  it("matches equal width_inches when cm missing", () => {
    assert.equal(
      fabricWidthsMatch({ width_inches: 60 }, { width_inches: 60 }),
      true
    );
  });

  it("does not match when either width is unknown", () => {
    assert.equal(fabricWidthsMatch({ width_cm: 150 }, {}), false);
    assert.equal(fabricWidthsMatch({}, { width_cm: 150 }), false);
  });
});

describe("findPreviousMeters", () => {
  const lines = [
    {
      lineId: "1",
      garment_type: "Shirt",
      width_cm: 150,
      meters: "2.5",
    },
    {
      lineId: "2",
      garment_type: "Trousers",
      width_cm: 150,
      meters: "1.8",
    },
    {
      lineId: "3",
      garment_type: "Shirt",
      width_cm: 140,
      meters: "3",
    },
    {
      lineId: "4",
      garment_type: "Shirt",
      width_cm: 150,
      meters: "2.8",
    },
  ];

  it("suggests from a single prior shirt at matching width (10-shirt flow)", () => {
    // One prior filled line is enough — 2nd (and later) shirt lines get 1.6.
    assert.equal(
      findPreviousMeters(
        [{ lineId: "1", garment_type: "Shirt", width_cm: 150, meters: "1.6" }],
        { garmentType: "Shirt", width: { width_cm: 150 } }
      ),
      "1.6"
    );
  });

  it("returns most recent same garment + width", () => {
    assert.equal(
      findPreviousMeters(lines, {
        garmentType: "Shirt",
        width: { width_cm: 150 },
      }),
      "2.8"
    );
  });

  it("ignores different width", () => {
    assert.equal(
      findPreviousMeters(lines.slice(0, 3), {
        garmentType: "Shirt",
        width: { width_cm: 150 },
      }),
      "2.5"
    );
  });

  it("does not suggest when only prior match has a different width", () => {
    assert.equal(
      findPreviousMeters(
        [{ lineId: "1", garment_type: "Shirt", width_cm: 140, meters: "1.6" }],
        { garmentType: "Shirt", width: { width_cm: 150 } }
      ),
      null
    );
  });

  it("skips excluded line and empty meters", () => {
    const withEmpty = [
      ...lines,
      { lineId: "5", garment_type: "Shirt", width_cm: 150, meters: "" },
    ];
    assert.equal(
      findPreviousMeters(withEmpty, {
        garmentType: "Shirt",
        width: { width_cm: 150 },
        excludeLineId: "4",
      }),
      "2.5"
    );
  });

  it("reads quantity from persisted order lines", () => {
    assert.equal(
      findPreviousMeters(
        [{ id: "a", garment_type: "Jacket", width_cm: 150, quantity: 3.2 }],
        { garmentType: "Jacket", width: { width_cm: 150 } }
      ),
      "3.2"
    );
  });

  it("returns null when no match", () => {
    assert.equal(
      findPreviousMeters(lines, {
        garmentType: "Coat",
        width: { width_cm: 150 },
      }),
      null
    );
  });
});

describe("suggestMetersIfEmpty", () => {
  it("soft-prefills empty meters from previous", () => {
    assert.equal(suggestMetersIfEmpty("", "1.6"), "1.6");
    assert.equal(suggestMetersIfEmpty("   ", "1.6"), "1.6");
  });

  it("never overwrites user-entered meters", () => {
    assert.equal(suggestMetersIfEmpty("2", "1.6"), "2");
    assert.equal(suggestMetersIfEmpty("1.6", "2.5"), "1.6");
  });
});
