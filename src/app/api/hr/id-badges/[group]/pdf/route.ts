import { NextResponse } from "next/server";
import { requireFactoryOpsAccess } from "@/lib/auth/session";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { readPayrollEmployees } from "@/lib/data/payroll-employees";
import {
  badgeGroupFromSlug,
  badgeSlugFromGroup,
  parseBadgePrintIds,
  selectBadgePrintEmployees,
} from "@/lib/hr/badge-print";
import { generateEmployeeBadgePdf } from "@/lib/hr/generate-employee-badge-pdf";

export const dynamic = "force-dynamic";

type RouteProps = {
  params: Promise<{ group: string }>;
};

export async function GET(request: Request, { params }: RouteProps) {
  try {
    const session = await requireFactoryOpsAccess();
    if (!session) {
      return NextResponse.json({ error: "Factory access required." }, { status: 403 });
    }

    const { group: groupSlug } = await params;
    const group = badgeGroupFromSlug(groupSlug);
    if (!group) {
      return NextResponse.json({ error: "Unknown badge group." }, { status: 404 });
    }

    await ensureDocumentsLoaded(["payroll_employees"]);
    const url = new URL(request.url);
    const ids = parseBadgePrintIds(url.searchParams.get("ids") ?? undefined);
    const employees = selectBadgePrintEmployees(
      readPayrollEmployees().employees,
      group,
      ids
    );

    const pdfBytes = await generateEmployeeBadgePdf(employees, group);
    const filename = `employee-badges-${badgeSlugFromGroup(group)}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Failed to generate employee badge PDF:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate PDF." },
      { status: 500 }
    );
  }
}
