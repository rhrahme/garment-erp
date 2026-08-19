import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMPLOYEE_JOB_FUNCTIONS,
  EMPLOYEE_JOB_FUNCTION_LABELS,
  formatJobFunctionsSummary,
  normalizeJobFunctions,
} from "@/lib/hr/job-functions";

describe("normalizeJobFunctions", () => {
  it("defaults missing/invalid values to empty", () => {
    assert.deepEqual(normalizeJobFunctions(undefined), []);
    assert.deepEqual(normalizeJobFunctions(null), []);
    assert.deepEqual(normalizeJobFunctions("cutter"), []);
    assert.deepEqual(normalizeJobFunctions(["nope", 1, null]), []);
  });

  it("dedupes and keeps catalog order", () => {
    assert.deepEqual(normalizeJobFunctions(["qc", "jacket_tailor", "qc", "cutter"]), [
      "jacket_tailor",
      "cutter",
      "qc",
    ]);
  });

  it("accepts legacy aliases and maps sleeve shirt keys to shirt_tailor", () => {
    assert.deepEqual(
      normalizeJobFunctions([
        "shirt",
        "shirt_ls_tailor",
        "shirt_ss_tailor",
        "short_tailor",
        "t_shirt_tailor",
        "boxer",
      ]),
      ["shorts_tailor", "shirt_tailor", "tshirt_tailor", "boxer_tailor"]
    );
  });

  it("includes new garment specialties from the stitch catalog", () => {
    for (const fn of [
      "shorts_tailor",
      "overshirt_tailor",
      "tshirt_tailor",
      "boxer_tailor",
      "vest_tailor",
      "polo_tailor",
      "overcoat_tailor",
    ] as const) {
      assert.ok(EMPLOYEE_JOB_FUNCTIONS.includes(fn));
      assert.ok(EMPLOYEE_JOB_FUNCTION_LABELS[fn]);
    }
    assert.equal(EMPLOYEE_JOB_FUNCTION_LABELS.shirt_tailor, "Shirt tailor");
    assert.ok(!EMPLOYEE_JOB_FUNCTIONS.some((fn) => fn.includes("ls") || fn.includes("ss")));
  });

  it("includes cleaner as an assignable job task", () => {
    assert.ok(EMPLOYEE_JOB_FUNCTIONS.includes("cleaner"));
    assert.equal(EMPLOYEE_JOB_FUNCTION_LABELS.cleaner, "Cleaner");
    assert.deepEqual(normalizeJobFunctions(["cleaner", "qc", "cleaner"]), ["qc", "cleaner"]);
  });

  it("includes washing, ironing, buttonhole, button stitch, champa, and bartek", () => {
    assert.ok(EMPLOYEE_JOB_FUNCTIONS.includes("champa"));
    assert.ok(EMPLOYEE_JOB_FUNCTIONS.includes("washing"));
    assert.ok(EMPLOYEE_JOB_FUNCTIONS.includes("ironing"));
    assert.ok(EMPLOYEE_JOB_FUNCTIONS.includes("buttonhole"));
    assert.ok(EMPLOYEE_JOB_FUNCTIONS.includes("button_stitch"));
    assert.ok(EMPLOYEE_JOB_FUNCTIONS.includes("bartek"));
    assert.equal(EMPLOYEE_JOB_FUNCTION_LABELS.champa, "Champa");
    assert.equal(EMPLOYEE_JOB_FUNCTION_LABELS.buttonhole, "Buttonhole");
    assert.equal(EMPLOYEE_JOB_FUNCTION_LABELS.button_stitch, "Button stitch");
    assert.equal(EMPLOYEE_JOB_FUNCTION_LABELS.bartek, "Bartek");
    assert.equal(EMPLOYEE_JOB_FUNCTION_LABELS.ironing, "Ironing");
    assert.deepEqual(
      normalizeJobFunctions(["button_whole", "washing", "champa", "buttonhole", "bartek"]),
      ["washing", "buttonhole", "champa", "bartek"]
    );
    assert.deepEqual(normalizeJobFunctions(["wash"]), []);
  });
});

describe("formatJobFunctionsSummary", () => {
  it("summarizes selection for the dropdown trigger", () => {
    assert.equal(formatJobFunctionsSummary([]), "Select roles...");
    assert.equal(formatJobFunctionsSummary(["cutter"]), "Cutter");
    assert.equal(formatJobFunctionsSummary(["jacket_tailor", "qc"]), "Jacket tailor, QC");
    assert.equal(formatJobFunctionsSummary(["jacket_tailor", "cutter", "qc"]), "3 roles");
    assert.equal(formatJobFunctionsSummary(["shorts_tailor"]), "Shorts tailor");
    assert.equal(formatJobFunctionsSummary(["tshirt_tailor"]), "T-shirt tailor");
    assert.equal(formatJobFunctionsSummary(["cleaner"]), "Cleaner");
    assert.equal(formatJobFunctionsSummary(["washing"]), "Washing");
    assert.equal(formatJobFunctionsSummary(["champa"]), "Champa");
    assert.equal(formatJobFunctionsSummary(["bartek"]), "Bartek");
    assert.equal(formatJobFunctionsSummary(["buttonhole"]), "Buttonhole");
  });
});
