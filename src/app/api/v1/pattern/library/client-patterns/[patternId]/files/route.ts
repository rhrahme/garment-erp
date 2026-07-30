import { NextResponse } from "next/server";
import {
  ensurePatternLibraryLoaded,
  getClientPatternByIdFresh,
  readPatternLibraryFresh,
} from "@/lib/data/pattern-library";
import { attachClientPatternFile } from "@/lib/pattern-library/mutations";
import { buildTudFillSuggestion } from "@/lib/pattern-library/tud-size-fill";
import {
  notifyLibraryFileUploaded,
  storeLibraryUpload,
  tudNotificationFields,
} from "@/lib/pattern-library/upload";
import { verifyApiKey } from "@/lib/integrations/api-auth";

/**
 * Zapier / API multipart upload for pattern library files (including versioned .TUD).
 * Form fields: file (required), optional version (trial version id), uploaded_by.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ patternId: string }> }
) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensurePatternLibraryLoaded();
    const { patternId } = await context.params;
    const pattern = await getClientPatternByIdFresh(patternId);
    if (!pattern) {
      return NextResponse.json({ error: "Client pattern not found." }, { status: 404 });
    }

    const url = new URL(request.url);
    const versionId = url.searchParams.get("version")?.trim() || null;
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required." }, { status: 400 });
    }
    const uploadedBy =
      typeof formData.get("uploaded_by") === "string"
        ? String(formData.get("uploaded_by")).trim() || "api"
        : "api";

    const stored = await storeLibraryUpload(file, patternId, uploadedBy);
    if (!stored.ok) {
      return NextResponse.json({ error: stored.error }, { status: 400 });
    }

    const result = await attachClientPatternFile(patternId, versionId, stored.attachment);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await notifyLibraryFileUploaded({
      client_pattern_id: patternId,
      version_id: versionId,
      file_id: stored.attachment.id,
      filename: stored.attachment.filename,
      kind: stored.attachment.kind,
      uploaded_by: uploadedBy,
      source: "api",
      ...tudNotificationFields(stored.attachment),
    });

    let tudFill = null;
    if (stored.attachment.tud) {
      const store = await readPatternLibraryFresh();
      tudFill = buildTudFillSuggestion({
        pattern: result.pattern,
        basePatterns: store.base_patterns,
        attachment: stored.attachment,
        versionId,
      });
    }

    return NextResponse.json(
      {
        pattern: result.pattern,
        file: stored.attachment,
        tud_fill: tudFill,
        source: "api",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to upload client pattern file (API):", error);
    return NextResponse.json({ error: "Failed to upload file." }, { status: 500 });
  }
}
