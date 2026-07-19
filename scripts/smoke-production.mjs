#!/usr/bin/env node
/**
 * Post-deploy smoke checks for erp.hagan.pro (or ERP_SMOKE_BASE_URL).
 *
 * Run: npm run smoke:production
 * Exit 0 when all checks pass; exit 1 on failure.
 */

const BASE_URL = (process.env.ERP_SMOKE_BASE_URL ?? "https://erp.hagan.pro").replace(/\/$/, "");
const TIMEOUT_MS = Number(process.env.ERP_SMOKE_TIMEOUT_MS ?? 15_000);

const REQUIRED_FABRIC_SUPPLIERS = [
  "caccioppoli",
  "zegna",
  "drapers",
  "stylbiella",
  "loro-piana",
  "solbiati",
  "canclini",
  "wool-stock",
  "gazaba",
  "custom",
];

async function fetchCheck(name, path, validate, options = {}) {
  const url = `${BASE_URL}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal, ...options.init });
    const bodyText = await res.text();
    let body;
    try {
      body = JSON.parse(bodyText);
    } catch {
      body = bodyText;
    }
    validate(res.status, body);
    console.log(`  OK  ${name} (${res.status})`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  FAIL ${name}: ${message}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log(`smoke-production: ${BASE_URL}\n`);

  const checks = [
    fetchCheck("health", "/api/v1/health", (status, body) => {
      if (status !== 200) throw new Error(`expected 200, got ${status}`);
      if (!body?.ok) throw new Error("health ok=false");
    }),
    fetchCheck("health/documents", "/api/v1/health/documents", (status, body) => {
      if (status !== 200) throw new Error(`expected 200, got ${status}`);
      if (!body?.ok) {
        throw new Error(`missing suppliers: ${(body?.missing ?? []).join(", ") || "unknown"}`);
      }
      for (const id of REQUIRED_FABRIC_SUPPLIERS) {
        if (!Array.isArray(body.present) || !body.present.includes(id)) {
          throw new Error(`required supplier missing from health: ${id}`);
        }
      }
    }),
    fetchCheck("health/fabric-catalog", "/api/v1/health/fabric-catalog", (status, body) => {
      if (status !== 200) throw new Error(`expected 200, got ${status}`);
      if (!body?.ok) {
        throw new Error(
          `catalog not ready (ready=${body?.catalog_ready}, S10005_has_price=${body?.sample?.solbiati_has_unit_price})`
        );
      }
      if (body.sample?.solbiati_has_unit_price !== true) {
        throw new Error("S10005 missing from Solbiati catalog on server");
      }
      // Public health must never echo monetary values.
      if (
        body.sample?.solbiati_unit_price != null ||
        body.sample?.loro_piana_lookup_unit_price != null ||
        Object.prototype.hasOwnProperty.call(body.sample ?? {}, "solbiati_unit_price") ||
        Object.prototype.hasOwnProperty.call(body.sample ?? {}, "loro_piana_lookup_unit_price")
      ) {
        throw new Error("fabric-catalog health leaked price fields");
      }
    }),
    fetchCheck("login page", "/login", (status) => {
      if (status !== 200) throw new Error(`expected 200, got ${status}`);
    }),
    fetchCheck("login API timeout", "/api/auth/login", (status, body) => {
      if (status !== 401 && status !== 503) {
        throw new Error(`expected 401 or 503, got ${status}`);
      }
      if (status === 503 && !body?.error) {
        throw new Error("503 without error message");
      }
    }, {
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "smoke-test@invalid.local", password: "invalid" }),
      },
    }),
    fetchCheck("fabric-brands auth gate", "/api/fabric-brands", (status, body) => {
      if (status !== 401) throw new Error(`expected 401 without session, got ${status}`);
      if (body?.error !== "Unauthorized.") {
        throw new Error(`expected Unauthorized error, got ${JSON.stringify(body)}`);
      }
    }),
  ];

  const results = await Promise.all(checks);
  const passed = results.filter(Boolean).length;

  console.log(`\nsmoke-production: ${passed}/${results.length} passed`);

  if (passed !== results.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("smoke-production: fatal error:", error);
  process.exit(1);
});
