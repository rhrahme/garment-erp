import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import {
  appendQualityInspection,
  listQualityInspectionsAsync,
} from "@/lib/data/quality-inspections";
import { notifyIntegration } from "@/lib/integrations";
import {
  buildQualityInspectionRecord,
  canCreateQualityInspection,
  parseQualityInspectionInput,
} from "@/lib/quality/inspections";

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const url = new URL(request.url);
    const limit = Math.min(
      500,
      Math.max(1, Number(url.searchParams.get("limit") ?? "200") || 200)
    );
    return NextResponse.json({ inspections: await listQualityInspectionsAsync(limit) });
  } catch (error) {
    console.error("Failed to list quality inspections:", error);
    return NextResponse.json(
      { error: "Failed to load quality inspections." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (!canCreateQualityInspection(session)) {
      return NextResponse.json(
        { error: "Only Admin, QC, and Factory Manager can log inspections." },
        { status: 403 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = parseQualityInspectionInput(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const inspection = buildQualityInspectionRecord(parsed.value, {
      createdBy: session.email ?? "unknown",
    });
    await appendQualityInspection(inspection);

    await notifyIntegration("quality_inspection.created", { ...inspection });

    return NextResponse.json({ inspection }, { status: 201 });
  } catch (error) {
    console.error("Failed to create quality inspection:", error);
    return NextResponse.json(
      { error: "Failed to save the inspection." },
      { status: 500 }
    );
  }
}
