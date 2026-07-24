import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PRODUCTION_OPERATOR_NAV_HREFS,
  SALES_OPERATOR_NAV_HREFS,
  defaultPathForEmail,
  defaultPathForSession,
  resolveRestrictedAccess,
} from "./permissions.ts";

describe("production_operator home / nav gating", () => {
  it("classifies production@hagan.pro as production_operator (not sales)", () => {
    assert.equal(
      resolveRestrictedAccess(null, "production@hagan.pro", false),
      "production_operator"
    );
    assert.equal(
      resolveRestrictedAccess("sales_operator", "production@hagan.pro", false),
      "production_operator"
    );
  });

  it("lands production on /production, never /sales", () => {
    assert.equal(defaultPathForEmail("production@hagan.pro"), "/production");
    assert.equal(
      defaultPathForSession({
        isProductionOperator: true,
        isSalesOperator: true,
      }),
      "/production"
    );
  });

  it("production nav excludes Sales Home", () => {
    assert.ok(!(PRODUCTION_OPERATOR_NAV_HREFS as readonly string[]).includes("/sales"));
    assert.ok((SALES_OPERATOR_NAV_HREFS as readonly string[]).includes("/sales"));
  });
});
