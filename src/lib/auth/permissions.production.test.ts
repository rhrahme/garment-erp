import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACCOUNTING_OPERATOR_NAV_HREFS,
  CLIENT_MANAGER_NAV_HREFS,
  INVENTORY_CLERK_NAV_HREFS,
  PATTERN_OPERATOR_NAV_HREFS,
  PRODUCTION_OPERATOR_BLOCKED_ROUTE_PREFIXES,
  PRODUCTION_OPERATOR_NAV_HREFS,
  SALES_OPERATOR_NAV_HREFS,
  STITCH_OPERATOR_NAV_HREFS,
  TASK_OPERATOR_NAV_HREFS,
  canAccessClientMedia,
  canAccessPatternModule,
  canAssignClientPhotoToFabric,
  defaultPathForEmail,
  defaultPathForSession,
  isAccountingOperatorRouteAllowed,
  isClientManagerRouteAllowed,
  isInventoryClerkEmail,
  isInventoryClerkRouteAllowed,
  isPatternOperatorRouteAllowed,
  isProductionOperatorRouteAllowed,
  isSalesOperatorRouteAllowed,
  isStitchOperatorRouteAllowed,
  isTaskOperatorRouteAllowed,
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
    assert.equal(isProductionOperatorRouteAllowed("/api/ready-made/catalog"), true);
    assert.equal(isProductionOperatorRouteAllowed("/brands"), true);
    assert.equal(isProductionOperatorRouteAllowed("/clients"), true);
    assert.equal(isProductionOperatorRouteAllowed("/fabric-specification"), true);
    assert.equal(isProductionOperatorRouteAllowed("/custom-fabrics/cf-1/print"), true);
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

  it("stitch nav includes kiosk, orders board, and clients (ready-made samples)", () => {
    const nav = STITCH_OPERATOR_NAV_HREFS as readonly string[];
    assert.deepEqual(nav, ["/stitch", "/stitch/orders", "/clients"]);
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
    assert.equal(isStitchOperatorRouteAllowed("/api/suppliers/loro-piana/images"), true);
    assert.equal(isStitchOperatorRouteAllowed("/api/suppliers/drapers/images/26130"), true);
    assert.equal(isStitchOperatorRouteAllowed("/api/suppliers/caccioppoli/images"), true);

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

describe("client_manager order draft backups", () => {
  // Regressed once: QC could open /orders/new but the server draft backup
  // 403'd ("Forbidden. Retry server backup") because the draft APIs were
  // missing from the client-manager allowlist.
  it("QC (client_manager) can back up order form drafts to the server", () => {
    assert.equal(isClientManagerRouteAllowed("/api/sales-order-drafts"), true);
    assert.equal(isClientManagerRouteAllowed("/api/fabric-order-drafts"), true);
  });
});

describe("client_manager add client + name-change request", () => {
  it("QC can create a client and request a name edit (admin still approves)", () => {
    assert.equal(isClientManagerRouteAllowed("/clients"), true);
    assert.equal(isClientManagerRouteAllowed("/api/clients"), true);
    assert.equal(
      isClientManagerRouteAllowed("/api/clients/client-1/name-change-request"),
      true
    );
  });
});

describe("quality inspections access (QC + factory manager)", () => {
  it("QC (client_manager) can open the Quality page and its APIs", () => {
    assert.equal(isClientManagerRouteAllowed("/quality"), true);
    assert.equal(isClientManagerRouteAllowed("/api/quality/inspections"), true);
  });

  it("factory manager can open the Quality page and its APIs", () => {
    assert.equal(isProductionOperatorRouteAllowed("/quality"), true);
    assert.equal(isProductionOperatorRouteAllowed("/api/quality/inspections"), true);
  });

  it("pattern and accounting stay blocked from quality APIs", () => {
    assert.equal(isPatternOperatorRouteAllowed("/api/quality/inspections"), false);
    assert.equal(isAccountingOperatorRouteAllowed("/api/quality/inspections"), false);
    assert.equal(isAccountingOperatorRouteAllowed("/quality"), false);
  });
});

describe("pattern_operator fabric swatch image routes", () => {
  const imageRoutes = [
    "/api/suppliers/loro-piana/images",
    "/api/suppliers/loro-piana/images/722042",
    "/api/suppliers/caccioppoli/images",
    "/api/suppliers/caccioppoli/images/360102",
    // Cached Drapers swatches - regressed once: missing here meant 403 ->
    // "No photo" on Fabric Specification for every non-admin role.
    "/api/suppliers/drapers/images",
    "/api/suppliers/drapers/images/26130",
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

describe("pattern_operator price surface lockdown (hagan.dp1@gmail.com)", () => {
  it("classifies the PATTERN_EMAILS login as pattern_operator and lands on /pattern", () => {
    const previous = process.env.PATTERN_EMAILS;
    process.env.PATTERN_EMAILS = "hagan.dp1@gmail.com";
    try {
      assert.equal(
        resolveRestrictedAccess(null, "hagan.dp1@gmail.com", false),
        "pattern_operator"
      );
      assert.equal(defaultPathForEmail("hagan.dp1@gmail.com"), "/pattern");
    } finally {
      if (previous === undefined) delete process.env.PATTERN_EMAILS;
      else process.env.PATTERN_EMAILS = previous;
    }
  });

  it("pattern nav contains no price-bearing pages", () => {
    const nav = PATTERN_OPERATOR_NAV_HREFS as readonly string[];
    assert.deepEqual(nav, [
      "/pattern",
      "/clients",
      "/fabric-specification",
      "/stitch",
    ]);
    for (const href of [
      "/orders",
      "/invoices",
      "/costing",
      "/fabric-orders",
      "/purchasing",
      "/supplier-invoices",
      "/sales",
      "/dashboard",
    ]) {
      assert.ok(!nav.includes(href), `nav must not include ${href}`);
    }
  });

  it("allows only price-redacted or price-free surfaces", () => {
    for (const path of [
      "/pattern",
      "/pattern/library",
      "/pattern/jobs/job-1",
      "/pattern/orders/so-1",
      "/clients",
      "/fabric-specification",
      "/custom-fabrics/cf-1/print",
      "/stitch",
      "/stitch/orders",
      "/production/stitch",
      "/api/production/sewing-session",
      "/api/production/sewing-session/scan",
      "/api/production/work-orders",
      "/api/production/work-orders/wo-1",
      "/api/sales-orders",
      "/api/sales-orders/so-1",
      "/api/pattern/overview",
      "/api/pattern/orders/so-1",
      "/api/pattern/jobs/job-1",
      "/api/pattern/library/client-fabrics/client-1",
      "/api/pattern/washed-ready",
      "/api/clients",
      "/api/custom-fabrics",
      "/api/fabric-search",
      "/api/fabric-brands",
      "/api/garment-type-changes",
      "/api/fabric-change-alerts",
      "/api/hr/employee-lookup",
      "/api/sales/client-photos",
      "/api/qr",
      "/api/auth/session",
    ]) {
      assert.equal(isPatternOperatorRouteAllowed(path), true, `expected allow: ${path}`);
    }
  });

  it("blocks every price-bearing route (API leaks count, not just UI)", () => {
    for (const path of [
      "/orders",
      "/orders/so-1",
      "/orders/new",
      "/invoices",
      "/invoices/inv-1",
      "/costing",
      "/fabric-orders",
      "/purchasing",
      "/supplier-invoices",
      "/supplier-emails",
      "/supplier-inbox",
      "/documents",
      "/sales",
      "/hr",
      "/dashboard",
      "/api/sales-orders/so-1/pdf",
      "/api/sales-orders/so-1/fabric-pos",
      "/api/supplier-fabrics",
      "/api/customer-invoices",
      "/api/customer-invoices/inv-1",
      "/api/fabric-orders",
      "/api/supplier-invoices",
      "/api/price-list-items",
      "/api/transporter-invoices",
      "/api/exchange-rates",
      "/api/auth/invoice-amounts",
      "/api/hr/payroll-employees",
      "/api/production",
      "/api/production/stage-scan",
      "/api/shipments",
    ]) {
      assert.equal(isPatternOperatorRouteAllowed(path), false, `expected block: ${path}`);
    }
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
      "/inventory",
    ]) {
      assert.ok(nav.includes(href), `expected nav to include ${href}`);
    }
    assert.ok(!nav.includes("/sales"));
    assert.ok(!nav.includes("/production"));
    assert.ok(!nav.includes("/dashboard"));
  });

  it("allows finance routes, AWB tracking view, and blocks factory floor", () => {
    assert.equal(isAccountingOperatorRouteAllowed("/inventory"), true);
    assert.equal(isAccountingOperatorRouteAllowed("/api/inventory/items"), true);
    assert.equal(isAccountingOperatorRouteAllowed("/inventory/cartons/print"), true);
    assert.equal(isAccountingOperatorRouteAllowed("/api/entity-images"), true);
    assert.equal(isAccountingOperatorRouteAllowed("/api/qr"), true);
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

describe("task_operator inventory (task 1)", () => {
  it("classifies hagan.task1@gmail.com as task_operator", () => {
    assert.equal(resolveRestrictedAccess(null, "hagan.task1@gmail.com", false), "task_operator");
  });

  it("keeps Task 1 as task_operator even if listed in CLIENT_MANAGER_EMAILS", () => {
    const previous = process.env.CLIENT_MANAGER_EMAILS;
    process.env.CLIENT_MANAGER_EMAILS = "hagan.qc@gmail.com,hagan.task1@gmail.com";
    try {
      assert.equal(resolveRestrictedAccess(null, "hagan.task1@gmail.com", false), "task_operator");
      assert.equal(resolveRestrictedAccess("client_manager", "hagan.task1@gmail.com", false), "task_operator");
    } finally {
      if (previous === undefined) delete process.env.CLIENT_MANAGER_EMAILS;
      else process.env.CLIENT_MANAGER_EMAILS = previous;
    }
  });

  it("nav includes inventory", () => {
    const nav = TASK_OPERATOR_NAV_HREFS as readonly string[];
    assert.ok(nav.includes("/inventory"));
  });

  it("allows inventory pages, APIs, photos, and 4x6 QR print", () => {
    assert.equal(isTaskOperatorRouteAllowed("/inventory"), true);
    assert.equal(isTaskOperatorRouteAllowed("/inventory/cartons/print"), true);
    assert.equal(isTaskOperatorRouteAllowed("/api/inventory/items"), true);
    assert.equal(isTaskOperatorRouteAllowed("/api/entity-images"), true);
    assert.equal(isTaskOperatorRouteAllowed("/api/qr"), true);
    assert.equal(isTaskOperatorRouteAllowed("/invoices"), false);
    assert.equal(isTaskOperatorRouteAllowed("/orders/new"), false);
  });
});

describe("inventory_clerk access", () => {
  it("classifies badge-inventory emails as inventory_clerk", () => {
    assert.equal(isInventoryClerkEmail("badge-inventory-2543411918@badge.hagan.pro"), true);
    assert.equal(isInventoryClerkEmail("badge-pattern-2543411918@badge.hagan.pro"), false);
    assert.equal(
      resolveRestrictedAccess(null, "badge-inventory-2543411918@badge.hagan.pro", false),
      "inventory_clerk"
    );
    assert.equal(
      resolveRestrictedAccess("inventory_clerk", "someone@hagan.pro", false),
      "inventory_clerk"
    );
  });

  it("lands inventory clerk on /inventory", () => {
    assert.equal(
      defaultPathForEmail("badge-inventory-2543411918@badge.hagan.pro"),
      "/inventory"
    );
    assert.equal(defaultPathForSession({ isInventoryClerk: true }), "/inventory");
  });

  it("nav is inventory only", () => {
    const nav = INVENTORY_CLERK_NAV_HREFS as readonly string[];
    assert.deepEqual([...nav], ["/inventory"]);
  });

  it("allows inventory pages and APIs, nothing else", () => {
    assert.equal(isInventoryClerkRouteAllowed("/inventory"), true);
    assert.equal(isInventoryClerkRouteAllowed("/inventory/cartons/print"), true);
    assert.equal(isInventoryClerkRouteAllowed("/inventory/cartons/box-1"), true);
    assert.equal(isInventoryClerkRouteAllowed("/api/inventory/items"), true);
    assert.equal(isInventoryClerkRouteAllowed("/api/inventory/cartons/box-1/open"), true);
    assert.equal(isInventoryClerkRouteAllowed("/api/entity-images"), true);
    assert.equal(
      isInventoryClerkRouteAllowed("/api/entity-images/upload-url"),
      true
    );
    assert.equal(isInventoryClerkRouteAllowed("/api/qr"), true);
    assert.equal(isInventoryClerkRouteAllowed("/api/auth/session"), true);
    assert.equal(isInventoryClerkRouteAllowed("/pattern"), false);
    assert.equal(isInventoryClerkRouteAllowed("/production"), false);
    assert.equal(isInventoryClerkRouteAllowed("/orders"), false);
    assert.equal(isInventoryClerkRouteAllowed("/stitch"), false);
    assert.equal(isInventoryClerkRouteAllowed("/hr"), false);
    assert.equal(isInventoryClerkRouteAllowed("/dashboard"), false);
    assert.equal(isInventoryClerkRouteAllowed("/clients"), false);
  });
});
