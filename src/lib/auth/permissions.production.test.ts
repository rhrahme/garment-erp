import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PRODUCTION_OPERATOR_BLOCKED_ROUTE_PREFIXES,
  PRODUCTION_OPERATOR_NAV_HREFS,
  SALES_OPERATOR_NAV_HREFS,
  canAccessPatternModule,
  defaultPathForEmail,
  defaultPathForSession,
  isProductionOperatorRouteAllowed,
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

  it("production nav excludes Sales Home and accounting", () => {
    const nav = PRODUCTION_OPERATOR_NAV_HREFS as readonly string[];
    assert.ok(!nav.includes("/sales"));
    assert.ok(!nav.includes("/dashboard"));
    assert.ok(!nav.includes("/invoices"));
    assert.ok(!nav.includes("/costing"));
    assert.ok(!nav.includes("/fabric-orders"));
    assert.ok(!nav.includes("/supplier-emails"));
    assert.ok(!nav.includes("/supplier-inbox"));
    assert.ok(!nav.includes("/supplier-invoices"));
    assert.ok(!nav.includes("/purchasing"));
    assert.ok(!nav.includes("/hr"));
    assert.ok(nav.includes("/hr/id-badges"));
    assert.ok(!nav.includes("/documents"));
    assert.ok((SALES_OPERATOR_NAV_HREFS as readonly string[]).includes("/sales"));
  });

  it("production nav restores factory ops tabs (not a 5-tab strip)", () => {
    const nav = PRODUCTION_OPERATOR_NAV_HREFS as readonly string[];
    for (const href of [
      "/fabric-receiving",
      "/thread-buttons",
      "/brands",
      "/clients",
      "/ready-made",
      "/fabric-specification",
      "/pattern",
      "/inventory",
      "/production",
      "/production/floor-map",
      "/orders",
      "/shipments",
      "/washing",
      "/quality",
      "/hr/id-badges",
    ]) {
      assert.ok(nav.includes(href), `expected nav to include ${href}`);
    }
    assert.ok(nav.length >= 12, "factory manager should have a full ops sidebar");
  });

  it("allows factory ops routes and blocks cost / sales CRM routes", () => {
    assert.equal(isProductionOperatorRouteAllowed("/pattern"), true);
    assert.equal(isProductionOperatorRouteAllowed("/pattern/jobs/abc"), true);
    assert.equal(isProductionOperatorRouteAllowed("/api/pattern/overview"), true);
    assert.equal(isProductionOperatorRouteAllowed("/inventory"), true);
    assert.equal(isProductionOperatorRouteAllowed("/shipments"), true);
    assert.equal(isProductionOperatorRouteAllowed("/api/shipments/local"), true);
    assert.equal(isProductionOperatorRouteAllowed("/washing"), true);
    assert.equal(isProductionOperatorRouteAllowed("/ready-made"), true);
    assert.equal(isProductionOperatorRouteAllowed("/brands"), true);
    assert.equal(isProductionOperatorRouteAllowed("/clients"), true);
    assert.equal(isProductionOperatorRouteAllowed("/fabric-specification"), true);
    assert.equal(isProductionOperatorRouteAllowed("/orders/SO-1/stickers"), true);
    assert.equal(isProductionOperatorRouteAllowed("/hr/id-badges"), true);
    assert.equal(isProductionOperatorRouteAllowed("/hr/id-badges/saudis"), true);
    assert.equal(isProductionOperatorRouteAllowed("/hr/id-badges/saudis/print"), true);
    assert.equal(isProductionOperatorRouteAllowed("/hr/id-badges/expats/print"), true);
    assert.equal(isProductionOperatorRouteAllowed("/api/hr/employees"), true);
    assert.equal(isProductionOperatorRouteAllowed("/api/hr/employee-lookup"), true);
    assert.equal(isProductionOperatorRouteAllowed("/api/hr/id-badges/saudis/pdf"), true);

    assert.equal(isProductionOperatorRouteAllowed("/sales"), false);
    assert.equal(isProductionOperatorRouteAllowed("/invoices"), false);
    assert.equal(isProductionOperatorRouteAllowed("/costing"), false);
    assert.equal(isProductionOperatorRouteAllowed("/fabric-orders"), false);
    assert.equal(isProductionOperatorRouteAllowed("/supplier-emails"), false);
    assert.equal(isProductionOperatorRouteAllowed("/supplier-inbox"), false);
    assert.equal(isProductionOperatorRouteAllowed("/purchasing"), false);
    assert.equal(isProductionOperatorRouteAllowed("/hr"), false);
    assert.equal(isProductionOperatorRouteAllowed("/api/hr/payroll-employees/x"), false);
    assert.equal(isProductionOperatorRouteAllowed("/documents"), false);
    assert.equal(isProductionOperatorRouteAllowed("/orders/new"), false);
  });

  it("documents blocked prefixes for accounting / purchasing / HR payroll", () => {
    const blocked = PRODUCTION_OPERATOR_BLOCKED_ROUTE_PREFIXES as readonly string[];
    for (const prefix of [
      "/sales",
      "/invoices",
      "/costing",
      "/fabric-orders",
      "/supplier-emails",
      "/supplier-inbox",
      "/supplier-invoices",
      "/purchasing",
      "/hr",
      "/documents",
    ]) {
      assert.ok(blocked.includes(prefix), `expected blocked list to include ${prefix}`);
    }
  });

  it("grants pattern module access to factory managers", () => {
    assert.equal(canAccessPatternModule(false, false, false, true), true);
    assert.equal(canAccessPatternModule(true, false, false, false), false);
    assert.equal(canAccessPatternModule(false, false, true, false), false);
    assert.equal(canAccessPatternModule(false, true, false, false), true);
  });
});
