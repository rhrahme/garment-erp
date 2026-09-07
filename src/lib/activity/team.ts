import { displayNameForEmail } from "@/lib/auth/user-display";
import {
  isAdminEmail,
  parseAccountingEmails,
  parseClientManagerEmails,
  parsePatternEmails,
  parseProductionEmails,
  parseSalesEmails,
  parseStitchEmails,
  parseTaskOperatorEmails,
} from "@/lib/auth/permissions";
import type { SessionContext } from "@/lib/auth/session";

export type ActivityTeam =
  | "admin"
  | "qc"
  | "pattern"
  | "task"
  | "sales"
  | "production"
  | "stitch"
  | "accounting"
  | "unknown";

export const ACTIVITY_TEAM_LABEL: Record<ActivityTeam, string> = {
  admin: "Admin",
  qc: "QC",
  pattern: "Pattern",
  task: "Task",
  sales: "Sales",
  production: "Floor",
  stitch: "Stitch",
  accounting: "Accounting",
  unknown: "Unknown",
};

/** Chip colors for the team name only - do not paint whole table rows. */
export const ACTIVITY_TEAM_CHIP_CLASS: Record<ActivityTeam, string> = {
  admin: "bg-slate-200 text-slate-800",
  qc: "bg-sky-100 text-sky-900",
  pattern: "bg-violet-100 text-violet-900",
  task: "bg-amber-100 text-amber-950",
  sales: "bg-emerald-100 text-emerald-900",
  production: "bg-orange-100 text-orange-950",
  stitch: "bg-rose-100 text-rose-900",
  accounting: "bg-teal-100 text-teal-900",
  unknown: "bg-slate-100 text-slate-600",
};

export function activityTeamFromEmail(email: string | null | undefined): ActivityTeam {
  const normalized = email?.trim().toLowerCase() ?? "";
  if (!normalized) return "unknown";
  if (isAdminEmail(normalized)) return "admin";
  if (parseClientManagerEmails().has(normalized)) return "qc";
  if (parsePatternEmails().has(normalized)) return "pattern";
  if (parseTaskOperatorEmails().has(normalized)) return "task";
  if (parseSalesEmails().has(normalized)) return "sales";
  if (parseProductionEmails().has(normalized)) return "production";
  if (parseStitchEmails().has(normalized)) return "stitch";
  if (parseAccountingEmails().has(normalized)) return "accounting";
  return "unknown";
}

export function activityTeamFromSession(
  session: Pick<
    SessionContext,
    | "isAdmin"
    | "isClientManager"
    | "isPatternOperator"
    | "isTaskOperator"
    | "isSalesOperator"
    | "isProductionOperator"
    | "isStitchOperator"
    | "isAccountingOperator"
    | "email"
  >
): ActivityTeam {
  if (session.isClientManager) return "qc";
  if (session.isPatternOperator) return "pattern";
  if (session.isTaskOperator) return "task";
  if (session.isSalesOperator) return "sales";
  if (session.isStitchOperator) return "stitch";
  if (session.isProductionOperator) return "production";
  if (session.isAccountingOperator) return "accounting";
  if (session.isAdmin) return "admin";
  return activityTeamFromEmail(session.email);
}

export function activityActorName(email: string | null | undefined): string {
  const normalized = email?.trim() ?? "";
  if (!normalized) return "Unknown";
  return displayNameForEmail(normalized) ?? normalized;
}

export function formatActivityActor(email: string | null | undefined): {
  email: string | null;
  name: string;
  team: ActivityTeam;
} {
  const normalized = email?.trim().toLowerCase() || null;
  return {
    email: normalized,
    name: activityActorName(normalized),
    team: activityTeamFromEmail(normalized),
  };
}
