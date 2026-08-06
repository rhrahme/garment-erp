import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { listOpenPatternOperatorNotices } from "@/lib/data/pattern-operator-notices";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import {
  createPatternOperatorNotice,
  ensureConsolidateFabricsHowToNotice,
} from "@/lib/pattern/pattern-operator-notice-actions";

export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  await ensureDocumentsLoaded(["pattern_operator_notices"]);
  try {
    await ensureConsolidateFabricsHowToNotice("api");
  } catch (error) {
    console.error("Failed to ensure Pattern consolidate how-to notice (API):", error);
  }
  return NextResponse.json({ notices: listOpenPatternOperatorNotices(50), source: "api" });
}

export async function POST(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  await ensureDocumentsLoaded(["pattern_operator_notices"]);
  try {
    const body = (await request.json()) as {
      id?: string;
      title?: string;
      body?: string;
      href?: string | null;
      href_label?: string | null;
      created_by?: string;
      email?: boolean;
    };
    if (!body.title?.trim() || !body.body?.trim()) {
      return NextResponse.json({ error: "title and body are required." }, { status: 400 });
    }
    const result = await createPatternOperatorNotice({
      id: body.id,
      title: body.title,
      body: body.body,
      href: body.href,
      href_label: body.href_label,
      created_by: body.created_by?.trim() || "api",
      email: body.email !== false,
    });
    return NextResponse.json({ ...result, source: "api" });
  } catch (error) {
    console.error("Failed to create Pattern operator notice (API):", error);
    return NextResponse.json({ error: "Failed to create notice." }, { status: 500 });
  }
}
