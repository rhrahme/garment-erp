import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatClientDisplayName,
  formatClientShortName,
  liftClientTitleFromNameParts,
  migrateClientName,
} from "./names.ts";

describe("formatClientShortName", () => {
  it("uses first + last when there is no title", () => {
    assert.equal(
      formatClientShortName({
        first_name: "Abdel",
        middle_name: "Aziz Fahd Al",
        last_name: "Ajlan",
      }),
      "Abdel Ajlan"
    );
    assert.equal(
      formatClientShortName({ first_name: "Turki", middle_name: null, last_name: "Luwaihiq" }),
      "Turki Luwaihiq"
    );
  });

  it("uses title + first name so Pr Khaled Bin Salman is Pr Khaled, not Pr Salman", () => {
    assert.equal(
      formatClientShortName({
        title: "Pr",
        first_name: "Khaled",
        middle_name: "Bin",
        last_name: "Salman",
      }),
      "Pr Khaled"
    );
    assert.equal(
      formatClientShortName({
        first_name: "Pr",
        middle_name: "Khaled Bin",
        last_name: "Salman",
      }),
      "Pr Khaled"
    );
  });
});

describe("formatClientDisplayName", () => {
  it("keeps the full legal name including title", () => {
    assert.equal(
      formatClientDisplayName({
        title: "Pr",
        first_name: "Khaled",
        middle_name: "Bin",
        last_name: "Salman",
      }),
      "Pr Khaled Bin Salman"
    );
    assert.equal(
      formatClientDisplayName({
        first_name: "Pr",
        middle_name: "Khaled Bin",
        last_name: "Salman",
      }),
      "Pr Khaled Bin Salman"
    );
  });
});

describe("liftClientTitleFromNameParts / migrateClientName", () => {
  it("lifts Pr out of first_name into title", () => {
    assert.deepEqual(
      liftClientTitleFromNameParts({
        first_name: "Pr",
        middle_name: "Khaled Bin",
        last_name: "Salman",
      }),
      { title: "Pr", first_name: "Khaled", middle_name: "Bin", last_name: "Salman" }
    );
    assert.deepEqual(
      migrateClientName({ first_name: "Pr", middle_name: "Khaled Bin", last_name: "Salman" }),
      { title: "Pr", first_name: "Khaled", middle_name: "Bin", last_name: "Salman" }
    );
  });
});
