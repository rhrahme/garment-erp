import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import {
  appendQualityInspection,
  listQualityInspectionsAsync,
} from "@/lib/data/quality-inspections";
import { notifyIntegration } from "@/lib/integrations";
import {
  buildQualityInspectionRecord,
  parseQualityInspectionInput,
} from "@/lib/quality/inspections";

export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    const url = new URL(request.url);
    const limit = Math.min(
      500,
      Math.max(1, Number(url.searchParams.get("limit") ?? "200") || 200)
    );
    return NextResponse.json({
      inspections: await listQualityInspectionsAsync(limit),
      source: "api",
    });
  } catch (error) {
    console.error("Failed to list quality inspections (API):", error);
    return NextResponse.json(
      { error: "Failed to load quality inspections." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = parseQualityInspectionInput(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const createdBy =
      typeof body.created_by === "string" && body.created_by.trim()
        ? body.created_by.trim()
        : "api";
    const inspection = buildQualityInspectionRecord(parsed.value, { createdBy });
    await appendQualityInspection(inspection);

    await notifyIntegration("quality_inspection.created", { ...inspection }, "api");

    return NextResponse.json({ inspection, source: "api" }, { status: 201 });
  } catch (error) {
    console.error("Failed to create quality inspection (API):", error);
    return NextResponse.json(
      { error: "Failed to save the inspection." },
      { status: 500 }
    );
  }
}
