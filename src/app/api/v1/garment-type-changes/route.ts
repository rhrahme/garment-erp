import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { listGarmentTypeChanges } from "@/lib/data/garment-type-changes";
import { notifyAdminsOfGarmentTypeChange } from "@/lib/integrations/garment-type-change-alert";
import {
  changeFabricLineGarmentType,
} from "@/lib/sales-orders/change-garment-type";
import { markGarmentTypeChangeAdminNotified } from "@/lib/sales-orders/garment-type-change-notify";

export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensureDocumentsLoaded(["garment_type_changes"]);
    const limit = Math.min(
      200,
      Math.max(1, Number(new URL(request.url).searchParams.get("limit") ?? "50") || 50)
    );
    return NextResponse.json({ changes: listGarmentTypeChanges(limit) });
  } catch (error) {
    console.error("Failed to list garment type changes (API):", error);
    return NextResponse.json({ error: "Failed to load garment type history." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as {
      sales_order_id?: string;
      line_id?: string;
      garment_type?: string;
      note?: string | null;
      changed_by?: string;
      skip_admin_email?: boolean;
    };

    const changedBy = body.changed_by?.trim() || "api";
    const result = await changeFabricLineGarmentType(
      {
        sales_order_id: body.sales_order_id ?? "",
        line_id: body.line_id ?? "",
        garment_type: body.garment_type ?? "",
        note: body.note,
      },
      { changedBy, notify: true }
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    let adminNotified = false;
    if (!body.skip_admin_email) {
      adminNotified = await notifyAdminsOfGarmentTypeChange(result.result.change);
      if (adminNotified) {
        await markGarmentTypeChangeAdminNotified(result.result.change.id);
      }
    }

    return NextResponse.json({
      change: result.result.change,
      order: result.result.order,
      updated_line: result.result.updated_line,
      admin_notified: adminNotified,
      source: "api",
    });
  } catch (error) {
    console.error("Failed to change garment type (API):", error);
    return NextResponse.json({ error: "Failed to change garment type." }, { status: 500 });
  }
}
