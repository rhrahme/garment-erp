import type { SessionContext } from "@/lib/auth/session";

const DISPLAY_NAME_BY_EMAIL: Record<string, string> = {
  "hagan.qc@gmail.com": "QC Hossein",
  "hagan.task1@gmail.com": "Hagan Task1",
  "production@hagan.pro": "Factory Manager",
  "sales1@hagan.pro": "Sales 1",
};

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

  const title = session.isProductionOperator
    ? "Factory Manager"
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
