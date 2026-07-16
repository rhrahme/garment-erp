import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { ensureFabricReceivingDocumentsLoaded } from "@/lib/data/fabric-receiving-docs";
import {
  parseDefectType,
  parseFoundAt,
  reportFabricDefect,
  updateFabricDefectStatus,
} from "@/lib/production/fabric-receiving-defects";

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensureFabricReceivingDocumentsLoaded();
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const receiptId = String(formData.get("receipt_id") ?? "").trim();
      const note = String(formData.get("note") ?? "");
      const foundAt = parseFoundAt(formData.get("found_at"));
      const defectType = parseDefectType(formData.get("defect_type"));
      const reportedBy = String(formData.get("reported_by") ?? "api").trim() || "api";

      if (!receiptId) {
        return NextResponse.json({ error: "receipt_id is required." }, { status: 400 });
      }
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
        reported_by: reportedBy,
        photos,
        source: "api",
      });
      return NextResponse.json(result, { status: 201 });
    }

    const body = (await request.json()) as {
      receipt_id?: string;
      defect_id?: string;
      action?: string;
      note?: string;
      found_at?: string;
      defect_type?: string;
      reported_by?: string;
    };

    // JSON body can acknowledge/resolve existing defects (no photo upload via JSON).
    if (body.action === "acknowledge" || body.action === "resolve") {
      const receiptId = String(body.receipt_id ?? "").trim();
      const defectId = String(body.defect_id ?? "").trim();
      if (!receiptId || !defectId) {
        return NextResponse.json(
          { error: "receipt_id and defect_id are required." },
          { status: 400 }
        );
      }
      const result = await updateFabricDefectStatus(
        receiptId,
        defectId,
        body.action,
        String(body.reported_by ?? "api").trim() || "api",
        "api"
      );
      return NextResponse.json(result);
    }

    return NextResponse.json(
      {
        error:
          "Use multipart/form-data to create a defect (receipt_id, note, found_at, photo), or JSON with action acknowledge|resolve.",
      },
      { status: 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process defect.";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
