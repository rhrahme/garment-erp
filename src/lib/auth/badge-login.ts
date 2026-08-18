import path from "path";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import {
  ensureDocumentsLoaded,
  readJsonFileAsync,
  readJsonFileFreshAsync,
  saveDocument,
} from "@/lib/data/document-persistence";
import { findPayrollEmployeeByBadgeValue, findPayrollEmployeeById } from "@/lib/hr/payroll-lookup";
import type { PayrollEmployee } from "@/lib/types/hr-payroll";
import { getSupabaseUrl } from "@/lib/supabase/env";

const STORE_PATH = path.join(process.cwd(), "src/data/badge-login-credentials.json");

/** Job functions whose holders may sign in with badge number + password. */
export const BADGE_LOGIN_JOB_FUNCTIONS = ["pattern"] as const;

/** Synthetic Supabase account for a badge login. Role is encoded in the local
 * part so email-list permission fallbacks work even if the profiles read is
 * degraded: badge-pattern-<employeeId>@badge.hagan.pro */
export const BADGE_LOGIN_EMAIL_DOMAIN = "badge.hagan.pro";
const BADGE_PATTERN_EMAIL_REGEX = /^badge-pattern-([a-z0-9]+)@badge\.hagan\.pro$/;

export const MIN_BADGE_PASSWORD_LENGTH = 6;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 10;

export type BadgeLoginCredential = {
  employee_id: string;
  employee_name: string;
  /** scrypt "salt:hash" hex. */
  password_hash: string;
  set_at: string;
  failed_attempts: number;
  locked_until: string | null;
  supabase_email: string;
  last_login_at: string | null;
};

type BadgeLoginStoreFile = {
  updated_at: string | null;
  credentials: BadgeLoginCredential[];
};

const EMPTY_STORE: BadgeLoginStoreFile = { updated_at: null, credentials: [] };

function normalize(raw: BadgeLoginStoreFile | null | undefined): BadgeLoginStoreFile {
  return {
    updated_at: raw?.updated_at ?? null,
    credentials: Array.isArray(raw?.credentials) ? raw!.credentials : [],
  };
}

async function readStoreFresh(): Promise<BadgeLoginStoreFile> {
  return normalize(await readJsonFileFreshAsync(STORE_PATH, EMPTY_STORE, { force: true }));
}

export async function readBadgeLoginStore(): Promise<BadgeLoginStoreFile> {
  return normalize(await readJsonFileAsync(STORE_PATH, EMPTY_STORE));
}

async function save(store: BadgeLoginStoreFile): Promise<void> {
  store.updated_at = new Date().toISOString();
  await saveDocument(STORE_PATH, store);
}

export function hashBadgePassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyBadgePassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function badgeLoginEmail(employeeId: string): string {
  return `badge-pattern-${employeeId.trim().toLowerCase()}@${BADGE_LOGIN_EMAIL_DOMAIN}`;
}

/** Employee id when the session email is a badge login, else null. */
export function badgeLoginEmployeeId(email: string | null | undefined): string | null {
  if (!email) return null;
  const match = BADGE_PATTERN_EMAIL_REGEX.exec(email.trim().toLowerCase());
  return match?.[1] ?? null;
}

export function isBadgePatternLoginEmail(email: string | null | undefined): boolean {
  return badgeLoginEmployeeId(email) !== null;
}

/**
 * Deterministic server-only Supabase password for the synthetic badge user.
 * Derived from the service-role key, which never reaches a client. If the key
 * is ever rotated, badgeSignInPassword changes; provisioning heals by
 * admin-updating the user's password on the next login.
 */
export function badgeSupabasePassword(employeeId: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createHmac("sha256", secret).update(`badge-login-v1:${employeeId}`).digest("hex");
}

export function employeeMayBadgeLogin(employee: PayrollEmployee): boolean {
  if (!employee.is_active) return false;
  const functions = (employee.job_functions ?? []).map((fn) => fn.toLowerCase());
  return BADGE_LOGIN_JOB_FUNCTIONS.some((allowed) => functions.includes(allowed));
}

export type BadgeLookupResult =
  | { ok: true; employee: PayrollEmployee; credential: BadgeLoginCredential | null }
  | { ok: false; error: string; status: number };

/** Resolve badge value -> eligible employee + existing credential (fresh read). */
export async function lookupBadgeForLogin(badgeValue: string): Promise<BadgeLookupResult> {
  await ensureDocumentsLoaded(["payroll_employees"]);
  const employee = findPayrollEmployeeByBadgeValue(badgeValue);
  if (!employee) {
    return { ok: false, error: "Badge number not recognized.", status: 404 };
  }
  if (!employeeMayBadgeLogin(employee)) {
    return {
      ok: false,
      error: "This badge is not enabled for badge login. Ask the admin.",
      status: 403,
    };
  }
  const store = await readStoreFresh();
  const credential =
    store.credentials.find(
      (row) => row.employee_id.toLowerCase() === employee.id.toLowerCase()
    ) ?? null;
  return { ok: true, employee, credential };
}

export type BadgePasswordCheck =
  | { ok: true }
  | { ok: false; error: string; status: number };

/** Verify password with lockout accounting. Persists attempt counters. */
export async function checkBadgePassword(
  employeeId: string,
  password: string
): Promise<BadgePasswordCheck> {
  const store = await readStoreFresh();
  const credential = store.credentials.find(
    (row) => row.employee_id.toLowerCase() === employeeId.toLowerCase()
  );
  if (!credential) {
    return { ok: false, error: "No password set for this badge yet.", status: 404 };
  }

  if (credential.locked_until && Date.parse(credential.locked_until) > Date.now()) {
    const minutes = Math.ceil((Date.parse(credential.locked_until) - Date.now()) / 60000);
    return {
      ok: false,
      error: `Too many wrong attempts. Locked for ${minutes} more minute(s).`,
      status: 429,
    };
  }

  if (!verifyBadgePassword(password, credential.password_hash)) {
    credential.failed_attempts = (credential.failed_attempts ?? 0) + 1;
    if (credential.failed_attempts >= MAX_FAILED_ATTEMPTS) {
      credential.locked_until = new Date(Date.now() + LOCKOUT_MINUTES * 60000).toISOString();
      credential.failed_attempts = 0;
    }
    await save(store);
    return { ok: false, error: "Wrong password.", status: 401 };
  }

  credential.failed_attempts = 0;
  credential.locked_until = null;
  credential.last_login_at = new Date().toISOString();
  await save(store);
  return { ok: true };
}

/** Create the credential on first login. Fails if one already exists. */
export async function createBadgeCredential(
  employee: PayrollEmployee,
  password: string
): Promise<{ ok: true; credential: BadgeLoginCredential } | { ok: false; error: string; status: number }> {
  if (password.length < MIN_BADGE_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${MIN_BADGE_PASSWORD_LENGTH} characters.`,
      status: 400,
    };
  }
  const store = await readStoreFresh();
  if (store.credentials.some((row) => row.employee_id === employee.id)) {
    return {
      ok: false,
      error: "A password is already set for this badge. Use it to sign in.",
      status: 409,
    };
  }
  const credential = buildCredential(employee, password);
  store.credentials.push(credential);
  await save(store);
  return { ok: true, credential };
}

function buildCredential(employee: PayrollEmployee, password: string): BadgeLoginCredential {
  return {
    employee_id: employee.id,
    employee_name: employee.full_name,
    password_hash: hashBadgePassword(password),
    set_at: new Date().toISOString(),
    failed_attempts: 0,
    locked_until: null,
    supabase_email: badgeLoginEmail(employee.id),
    last_login_at: null,
  };
}

/** Admin/ops: set or reset a badge password (upsert). */
export async function upsertBadgeCredential(
  employee: PayrollEmployee,
  password: string
): Promise<{ ok: true; credential: BadgeLoginCredential } | { ok: false; error: string; status: number }> {
  if (password.length < MIN_BADGE_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${MIN_BADGE_PASSWORD_LENGTH} characters.`,
      status: 400,
    };
  }
  const store = await readStoreFresh();
  const next = buildCredential(employee, password);
  const index = store.credentials.findIndex((row) => row.employee_id === employee.id);
  if (index >= 0) {
    const previous = store.credentials[index]!;
    store.credentials[index] = {
      ...next,
      last_login_at: previous.last_login_at,
    };
  } else {
    store.credentials.push(next);
  }
  await save(store);
  return { ok: true, credential: store.credentials[index >= 0 ? index : store.credentials.length - 1]! };
}

/**
 * Shared-email logins that belong to a specific pattern employee.
 * Used so actions taken on hagan.dp1@ still attribute to Mohtajul.
 */
export const PATTERN_EMAIL_EMPLOYEES: Record<string, { id: string; name: string }> = {
  "hagan.dp1@gmail.com": { id: "2625917972", name: "Mohtajul" },
};

/** Badge employee id when the Email tab should become a badge session. */
export function patternBadgeIdForEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return PATTERN_EMAIL_EMPLOYEES[email.trim().toLowerCase()]?.id ?? null;
}

/** Temporary second-operator login until their real badge number is issued. */
export const PATTERN_TEMP_LOGIN_IDS: Record<string, string> = {
  xx22: "Pattern 2",
};

/**
 * Human label for pattern writes: "Mohtajul (2625917972)" so admin can
 * tell which of the two shared-workspace operators changed a sheet.
 */
export function patternActorLabel(email: string | null | undefined): string {
  const normalized = email?.trim().toLowerCase() ?? "";
  if (!normalized) return "unknown";
  const mapped = PATTERN_EMAIL_EMPLOYEES[normalized];
  const employeeId = badgeLoginEmployeeId(normalized) ?? mapped?.id ?? null;
  if (!employeeId) return email!.trim();
  const employee = findPayrollEmployeeById(employeeId);
  const name =
    employee?.short_name?.trim() ||
    employee?.full_name?.trim() ||
    mapped?.name ||
    PATTERN_TEMP_LOGIN_IDS[employeeId] ||
    "Pattern";
  const displayId = employee?.employee_id_number?.trim() || (employeeId === "xx22" ? "XX22" : employeeId);
  return `${name} (${displayId})`;
}

function supabaseAdmin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  return createSupabaseAdminClient(getSupabaseUrl(), serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Ensure the synthetic Supabase user + pattern_operator profile exist so
 * middleware / session role resolution work with no env changes. Idempotent;
 * also heals the derived password after a service-key rotation.
 */
export async function provisionBadgeSupabaseUser(
  employee: PayrollEmployee
): Promise<{ userId: string }> {
  const admin = supabaseAdmin();
  const email = badgeLoginEmail(employee.id);
  const password = badgeSupabasePassword(employee.id);

  let userId: string | null = null;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      badge_login: true,
      employee_id: employee.id,
      employee_name: employee.full_name,
    },
  });
  if (created?.user) {
    userId = created.user.id;
  } else if (createError) {
    // Already exists - find it and reset the derived password (idempotent heal).
    const { data: list, error: listError } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listError) throw new Error(`Badge user lookup failed: ${listError.message}`);
    const existing = list.users.find(
      (row) => row.email?.toLowerCase() === email.toLowerCase()
    );
    if (!existing) throw new Error(`Badge user creation failed: ${createError.message}`);
    userId = existing.id;
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, { password });
    if (updateError) throw new Error(`Badge user password heal failed: ${updateError.message}`);
  }
  if (!userId) throw new Error("Badge user provisioning failed.");

  // Profile row drives role resolution in middleware + session.
  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: userId,
      full_name: employee.full_name,
      role: "pattern_operator",
      is_active: true,
    },
    { onConflict: "id" }
  );
  if (profileError) {
    console.warn("[badge-login] profile upsert failed:", profileError.message);
  }

  return { userId };
}
