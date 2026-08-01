import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACCOUNTING_OPERATOR_NAV_HREFS,
  CLIENT_MANAGER_NAV_HREFS,
  PRODUCTION_OPERATOR_BLOCKED_ROUTE_PREFIXES,
  PRODUCTION_OPERATOR_NAV_HREFS,
  SALES_OPERATOR_NAV_HREFS,
  STITCH_OPERATOR_NAV_HREFS,
  canAccessClientMedia,
  canAccessPatternModule,
  canAssignClientPhotoToFabric,
  defaultPathForEmail,
  defaultPathForSession,
  isAccountingOperatorRouteAllowed,
  isClientManagerRouteAllowed,
  isPatternOperatorRouteAllowed,
  isProductionOperatorRouteAllowed,
  isSalesOperatorRouteAllowed,
  isStitchOperatorRouteAllowed,
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
      "/stitch",
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

describe("stitch_operator kiosk gating", () => {
  it("classifies stitch@hagan.pro as stitch_operator", () => {
    assert.equal(resolveRestrictedAccess(null, "stitch@hagan.pro", false), "stitch_operator");
    assert.equal(
      resolveRestrictedAccess("production_operator", "stitch@hagan.pro", false),
      "stitch_operator"
    );
  });

  it("lands stitch on /stitch", () => {
    assert.equal(defaultPathForEmail("stitch@hagan.pro"), "/stitch");
    assert.equal(defaultPathForSession({ isStitchOperator: true }), "/stitch");
  });

  it("stitch nav includes kiosk and orders board", () => {
    const nav = STITCH_OPERATOR_NAV_HREFS as readonly string[];
    assert.deepEqual(nav, ["/stitch", "/stitch/orders"]);
  });

  it("allows sewing kiosk routes and read-only order APIs; blocks the rest of the ERP", () => {
    assert.equal(isStitchOperatorRouteAllowed("/stitch"), true);
    assert.equal(isStitchOperatorRouteAllowed("/stitch/orders"), true);
    assert.equal(isStitchOperatorRouteAllowed("/production/stitch"), true);
    assert.equal(isStitchOperatorRouteAllowed("/api/production/sewing-session"), true);
    assert.equal(isStitchOperatorRouteAllowed("/api/production/sewing-session/scan"), true);
    assert.equal(isStitchOperatorRouteAllowed("/api/production/work-orders"), true);
    assert.equal(isStitchOperatorRouteAllowed("/api/production/work-orders/wo-1"), true);
    assert.equal(isStitchOperatorRouteAllowed("/api/sales-orders"), true);
    assert.equal(isStitchOperatorRouteAllowed("/api/sales-orders/so-1"), true);
    assert.equal(isStitchOperatorRouteAllowed("/api/qr"), true);
    assert.equal(isStitchOperatorRouteAllowed("/api/hr/employee-lookup"), true);
    assert.equal(isStitchOperatorRouteAllowed("/api/auth/session"), true);

    assert.equal(isStitchOperatorRouteAllowed("/production"), false);
    assert.equal(isStitchOperatorRouteAllowed("/orders"), false);
    assert.equal(isStitchOperatorRouteAllowed("/orders/so-1"), false);
    assert.equal(isStitchOperatorRouteAllowed("/orders/so-1/print"), false);
    assert.equal(isStitchOperatorRouteAllowed("/sales"), false);
    assert.equal(isStitchOperatorRouteAllowed("/dashboard"), false);
    assert.equal(isStitchOperatorRouteAllowed("/invoices"), false);
    assert.equal(isStitchOperatorRouteAllowed("/api/production/stage-scan"), false);
    assert.equal(isStitchOperatorRouteAllowed("/api/sales-orders/so-1/stickers"), false);
    assert.equal(isStitchOperatorRouteAllowed("/api/sales-orders/so-1/pdf"), false);
    assert.equal(
      isStitchOperatorRouteAllowed("/api/sales-orders/so-1/fabric-lines/print"),
      false
    );
    assert.equal(
      isStitchOperatorRouteAllowed("/api/sales-orders/so-1/fabric-lines/transfer"),
      false
    );
  });
});

describe("client_manager QC ID badges (not payroll)", () => {
  it("classifies hagan.qc@gmail.com as client_manager", () => {
    assert.equal(resolveRestrictedAccess(null, "hagan.qc@gmail.com", false), "client_manager");
  });

  it("QC nav includes ID Badges but not payroll register", () => {
    const nav = CLIENT_MANAGER_NAV_HREFS as readonly string[];
    assert.ok(nav.includes("/hr/id-badges"));
    assert.ok(!nav.includes("/hr"));
  });

  it("allows Expat badge pages and APIs; blocks Saudis, payroll register, and salary APIs", () => {
    assert.equal(isClientManagerRouteAllowed("/hr/id-badges"), true);
    assert.equal(isClientManagerRouteAllowed("/hr/id-badges/expats"), true);
    assert.equal(isClientManagerRouteAllowed("/hr/id-badges/expats/print"), true);
    assert.equal(isClientManagerRouteAllowed("/api/hr/employees"), true);
    assert.equal(
      isClientManagerRouteAllowed("/api/hr/employees/emp-1/job-functions"),
      true
    );
    assert.equal(isClientManagerRouteAllowed("/api/hr/employees/emp-1"), true);
    assert.equal(isClientManagerRouteAllowed("/api/hr/employee-lookup"), true);
    assert.equal(isClientManagerRouteAllowed("/api/hr/id-badges/expats/pdf"), true);

    assert.equal(isClientManagerRouteAllowed("/hr/id-badges/saudis"), false);
    assert.equal(isClientManagerRouteAllowed("/hr/id-badges/saudis/print"), false);
    assert.equal(isClientManagerRouteAllowed("/api/hr/id-badges/saudis/pdf"), false);
    assert.equal(isClientManagerRouteAllowed("/hr"), false);
    assert.equal(isClientManagerRouteAllowed("/hr/"), false);
    assert.equal(isClientManagerRouteAllowed("/api/hr/payroll-employees"), false);
    assert.equal(isClientManagerRouteAllowed("/api/hr/payroll-employees/x"), false);
  });
});

describe("pattern_operator fabric swatch image routes", () => {
  const imageRoutes = [
    "/api/suppliers/loro-piana/images",
    "/api/suppliers/loro-piana/images/722042",
    "/api/suppliers/caccioppoli/images",
    "/api/suppliers/caccioppoli/images/360102",
    "/api/integrations/drapers/medias",
    "/api/integrations/caccioppoli/images",
  ];

  it("allows all fabric swatch APIs used by the eye/preview UI", () => {
    for (const path of imageRoutes) {
      assert.equal(isPatternOperatorRouteAllowed(path), true, path);
      assert.equal(isProductionOperatorRouteAllowed(path), true, path);
      assert.equal(isSalesOperatorRouteAllowed(path), true, path);
    }
  });

  it("still blocks order/accounting routes for pattern_operator", () => {
    assert.equal(isPatternOperatorRouteAllowed("/pattern/library/fabrics/client-1"), true);
    assert.equal(isPatternOperatorRouteAllowed("/api/pattern/library/client-fabrics/x"), true);
    assert.equal(isPatternOperatorRouteAllowed("/api/sales/client-photos"), true);
    assert.equal(isPatternOperatorRouteAllowed("/api/sales/client-photos/photo-1"), true);
    assert.equal(isPatternOperatorRouteAllowed("/api/pattern/scan"), true);
    assert.equal(isPatternOperatorRouteAllowed("/api/hr/employee-lookup"), true);
    assert.equal(isPatternOperatorRouteAllowed("/orders"), false);
    assert.equal(isPatternOperatorRouteAllowed("/invoices"), false);
    assert.equal(isPatternOperatorRouteAllowed("/costing"), false);
  });
});

describe("pattern_operator client media assign", () => {
  it("allows pattern to view client media and assign photos to fabrics", () => {
    assert.equal(
      canAccessClientMedia({ isPatternOperator: true }),
      true
    );
    assert.equal(
      canAssignClientPhotoToFabric({ isPatternOperator: true }),
      true
    );
    assert.equal(
      canAssignClientPhotoToFabric({ isAdmin: true }),
      true
    );
    assert.equal(canAssignClientPhotoToFabric({}), false);
  });
});

describe("accounting_operator access", () => {
  it("classifies accounting@hagan.pro as accounting", () => {
    assert.equal(resolveRestrictedAccess(null, "accounting@hagan.pro", false), "accounting");
    assert.equal(
      resolveRestrictedAccess("viewer", "accounting@hagan.pro", false),
      "accounting"
    );
  });

  it("lands accounting on /invoices", () => {
    assert.equal(defaultPathForEmail("accounting@hagan.pro"), "/invoices");
    assert.equal(
      defaultPathForSession({ isAccountingOperator: true }),
      "/invoices"
    );
  });

  it("accounting nav includes finance areas, not factory or sales CRM", () => {
    const nav = ACCOUNTING_OPERATOR_NAV_HREFS as readonly string[];
    for (const href of [
      "/invoices",
      "/costing",
      "/fabric-orders",
      "/supplier-emails",
      "/supplier-inbox",
      "/supplier-invoices",
      "/purchasing",
      "/shipments",
      "/documents",
    ]) {
      assert.ok(nav.includes(href), `expected nav to include ${href}`);
    }
    assert.ok(!nav.includes("/sales"));
    assert.ok(!nav.includes("/production"));
    assert.ok(!nav.includes("/dashboard"));
  });

  it("allows finance routes, AWB tracking view, and blocks factory floor", () => {
    assert.equal(isAccountingOperatorRouteAllowed("/invoices"), true);
    assert.equal(isAccountingOperatorRouteAllowed("/costing"), true);
    assert.equal(isAccountingOperatorRouteAllowed("/supplier-invoices"), true);
    assert.equal(isAccountingOperatorRouteAllowed("/supplier-emails"), true);
    assert.equal(isAccountingOperatorRouteAllowed("/shipments"), true);
    assert.equal(isAccountingOperatorRouteAllowed("/api/shipments/local"), true);
    assert.equal(isAccountingOperatorRouteAllowed("/api/shipments/pending"), true);
    assert.equal(isAccountingOperatorRouteAllowed("/api/supplier-emails"), true);
    assert.equal(isAccountingOperatorRouteAllowed("/api/fabric-orders/send-email"), false);
    assert.equal(isAccountingOperatorRouteAllowed("/api/email/send-test"), false);
    assert.equal(isAccountingOperatorRouteAllowed("/api/customer-invoices"), true);
    assert.equal(isAccountingOperatorRouteAllowed("/production"), false);
    assert.equal(isAccountingOperatorRouteAllowed("/sales"), false);
    assert.equal(isAccountingOperatorRouteAllowed("/orders/new"), false);
    assert.equal(isAccountingOperatorRouteAllowed("/fabric-specification"), false);
  });
});
