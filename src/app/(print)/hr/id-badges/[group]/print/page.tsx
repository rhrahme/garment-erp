import { notFound, redirect } from "next/navigation";
import { EmployeeBadgePrintSheet } from "@/components/hr/EmployeeBadgePrintSheet";
import { getSessionContext } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readPayrollEmployees, toBadgeSafeEmployee } from "@/lib/data/payroll-employees";
import {
  badgeGroupFromSlug,
  parseBadgePrintIds,
  selectBadgePrintEmployees,
} from "@/lib/hr/badge-print";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ group: string }>;
  searchParams: Promise<{ ids?: string }>;
};

export default async function EmployeeBadgePrintPage({ params, searchParams }: PageProps) {
  const { group: groupSlug } = await params;
  const { ids: idsParam } = await searchParams;
  const group = badgeGroupFromSlug(groupSlug);
  if (!group) notFound();

  // Middleware allowlists /hr/id-badges for Production + QC; payroll register stays blocked.
  const session = await getSessionContext();
  // QC prints Expats only.
  if (session.isClientManager && group === "saudi") {
    redirect("/hr/id-badges/expats");
  }
  await ensureDocumentsLoaded(["payroll_employees"]);
  const payroll = readPayrollEmployees();
  const ids = parseBadgePrintIds(idsParam);
  const selected = selectBadgePrintEmployees(payroll.employees, group, ids);
  const employees = session.isAdmin ? selected : selected.map(toBadgeSafeEmployee);

  return <EmployeeBadgePrintSheet employees={employees} group={group} />;
}
