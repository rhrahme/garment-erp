import { NextResponse } from "next/server";
import { requireAuthenticated, type SessionContext } from "@/lib/auth/session";
import { ensureFabricReceivingDocumentsLoaded } from "@/lib/data/fabric-receiving-docs";
import {
  listAllFabricDefects,
  parseDefectType,
  parseFoundAt,
  reportFabricDefect,
} from "@/lib/production/fabric-receiving-defects";

function canManageDefects(session: SessionContext): boolean {
  return session.isAdmin || session.isClientManager;
}

function canReportDefects(session: SessionContext): boolean {
  return Boolean(session.userId || session.email);
}

export async function GET(request: Request) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (!canManageDefects(session)) {
    return NextResponse.json({ error: "Admin or QC access required." }, { status: 403 });
  }

  try {
    await ensureFabricReceivingDocumentsLoaded();
    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status");
    const status =
      statusParam === "open" || statusParam === "acknowledged" || statusParam === "resolved"
        ? statusParam
        : "all";
    const result = await listAllFabricDefects({ status });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list defects.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAuthenticated();
  if (!session || !canReportDefects(session)) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  try {
    await ensureFabricReceivingDocumentsLoaded();
    const formData = await request.formData();
    const receiptId = String(formData.get("receipt_id") ?? "").trim();
    const note = String(formData.get("note") ?? "");
    const foundAtRaw = formData.get("found_at");
    const defectType = parseDefectType(formData.get("defect_type"));

    if (!receiptId) {
      return NextResponse.json({ error: "receipt_id is required." }, { status: 400 });
    }

    const foundAt = parseFoundAt(foundAtRaw);
    if (!foundAt) {
      return NextResponse.json(
        { error: 'found_at must be "receiving" or "cutting".' },
        { status: 400 }
      );
    }

    const photos: File[] = [];
    for (const [key, value] of formData.entries()) {
      if ((key === "photo" || key === "photos" || key.startsWith("photo")) && value instanceof File) {
        if (value.size > 0) photos.push(value);
      }
    }

    const result = await reportFabricDefect({
      receipt_id: receiptId,
      note,
      found_at: foundAt,
      defect_type: defectType,
      reported_by: session.email ?? session.userId ?? "unknown",
      photos,
      source: "erp",
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to report defect.";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
