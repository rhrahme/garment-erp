import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { verifyApiKey } from "@/lib/integrations";
import {
  ensureAllPatternHowToNotices,
  listOpenTeamHowToNotices,
} from "@/lib/pattern/pattern-operator-notice-actions";

/** Zapier parity: list open all-teams how-tos (?actor=). */
export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  await ensureDocumentsLoaded(["pattern_operator_notices"]);
  try {
    await ensureAllPatternHowToNotices("api");
  } catch (error) {
    console.error("Failed to ensure all-teams how-to notices (API):", error);
  }
  const actor = new URL(request.url).searchParams.get("actor")?.trim() || "api";
  return NextResponse.json({
    notices: listOpenTeamHowToNotices(actor),
    source: "api",
  });
}
