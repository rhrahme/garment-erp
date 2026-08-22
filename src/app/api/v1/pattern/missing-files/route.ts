import { NextResponse } from "next/server";
import { ensureDocumentsLoaded } from "@/lib/data/document-persistence";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import { listMissingFilesReport } from "@/lib/pattern-library/load-missing-files-report";
import type { MissingFilesFilter } from "@/lib/pattern-library/missing-files-report";

function parseFilter(value: string | null): MissingFilesFilter {
  if (value === "missing_tud" || value === "missing_other") return value;
  return "all";
}

export async function GET(request: Request) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensureDocumentsLoaded(["pattern_library", "pattern_jobs", "sales_orders"]);
    const filter = parseFilter(new URL(request.url).searchParams.get("filter"));
    const report = await listMissingFilesReport(filter);
    return NextResponse.json({ ...report, filter, source: "api" });
  } catch (error) {
    console.error("Failed to load Pattern missing files (API):", error);
    return NextResponse.json({ error: "Failed to load missing files." }, { status: 500 });
  }
}
