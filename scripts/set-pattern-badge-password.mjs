import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq < 1) continue;
  const key = trimmed.slice(0, eq);
  let value = trimmed.slice(eq + 1);
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = value;
}

const badge = process.argv[2]?.trim();
const password = process.argv[3] ?? "";
if (!badge || !password) {
  console.error("Usage: set-pattern-badge-password.mjs <badge-id> <password>");
  process.exit(1);
}

const { ensureDocumentsLoaded } = await import("../src/lib/data/document-persistence.ts");
const { upsertBadgeCredential, provisionBadgeSupabaseUser } = await import(
  "../src/lib/auth/badge-login.ts"
);
const { findPayrollEmployeeByBadgeValue } = await import("../src/lib/hr/payroll-lookup.ts");

await ensureDocumentsLoaded(["payroll_employees", "badge_login_credentials"]);
let employee = findPayrollEmployeeByBadgeValue(badge);
if (!employee && badge.toUpperCase() === "XX22") {
  const { createPayrollEmployee } = await import("../src/lib/data/payroll-employees.ts");
  employee = await createPayrollEmployee({
    full_name: "Pattern 2",
    employee_id_number: "XX22",
    short_name: "Pattern 2",
    badge_group: "expat",
    job_functions: ["pattern"],
  });
  console.log("created temporary pattern employee", employee.id);
}
if (!employee) {
  console.error("Employee not found for badge", badge);
  process.exit(1);
}

const saved = await upsertBadgeCredential(employee, password);
if (!saved.ok) {
  console.error(saved.error);
  process.exit(1);
}
await provisionBadgeSupabaseUser(employee);
console.log("ok", employee.full_name, saved.credential.supabase_email);
