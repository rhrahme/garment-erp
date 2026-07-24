import { notFound } from "next/navigation";
import { EmployeeBadgePrintSheet } from "@/components/hr/EmployeeBadgePrintSheet";
import { getSessionContext } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readPayrollEmployees } from "@/lib/data/payroll-employees";
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

  // Same audience as badge tabs — middleware already allowlists /hr/id-badges for Production.
  await getSessionContext();
  await ensureDocumentsLoaded(["payroll_employees"]);
  const payroll = readPayrollEmployees();
  const ids = parseBadgePrintIds(idsParam);
  const employees = selectBadgePrintEmployees(payroll.employees, group, ids);

  return <EmployeeBadgePrintSheet employees={employees} group={group} />;
}
