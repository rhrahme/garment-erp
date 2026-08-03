import type { SessionContext } from "@/lib/auth/session";

const DISPLAY_NAME_BY_EMAIL: Record<string, string> = {
  "hagan.qc@gmail.com": "QC Hossein",
  "hagan.task1@gmail.com": "Hagan Task1",
  "production@hagan.pro": "Factory Manager",
  "stitch@hagan.pro": "Stitch Floor",
  "accounting@hagan.pro": "Accounting",
  "sales1@hagan.pro": "Sales 1",
};

/** Friendly name for a known account email (e.g. "QC Hossein"), or null. */
export function displayNameForEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase() ?? "";
  return normalized ? DISPLAY_NAME_BY_EMAIL[normalized] ?? null : null;
}

export function resolveUserDisplay(session: SessionContext): {
  name: string;
  title: string;
  initial: string;
} {
  const email = session.email?.trim().toLowerCase() ?? "";
  const mappedName = email ? DISPLAY_NAME_BY_EMAIL[email] : undefined;

  const name =
    mappedName ??
    (session.isSuperAdmin ? "Super Admin" : session.isAdmin ? "Admin User" : email || "User");

  const title = session.isStitchOperator
    ? "Stitch Floor"
    : session.isProductionOperator
      ? "Factory Manager"
      : session.isAccountingOperator
        ? "Accounting"
        : session.isTaskOperator
          ? "Production Floor"
          : session.isSalesOperator
            ? "Sales"
            : session.isClientManager
              ? "Quality Control"
              : session.isSuperAdmin
                ? "Super Admin"
                : session.isAdmin
                  ? "Production Manager"
                  : "User";

  const initial = name.trim().charAt(0).toUpperCase() || "U";

  return { name, title, initial };
}
