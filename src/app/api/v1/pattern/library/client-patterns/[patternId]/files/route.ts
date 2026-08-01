import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/integrations/api-auth";
import {
  ensurePatternLibraryLoaded,
  getClientPatternByIdFresh,
  readPatternLibraryFresh,
} from "@/lib/data/pattern-library";
import { readPatternLibraryFile } from "@/lib/pattern-library/file-storage";
import { attachClientPatternFile } from "@/lib/pattern-library/mutations";
import { buildTudFillSuggestion, type TudFillSuggestion } from "@/lib/pattern-library/tud-size-fill";
import {
  dxfNotificationFields,
  notifyLibraryFileUploaded,
  resolveLibraryFileRequest,
  rulNotificationFields,
  storeLibraryUpload,
  tudNotificationFields,
  tumNotificationFields,
} from "@/lib/pattern-library/upload";

/** Zapier / API-key parity for client-pattern file upload (incl. per-piece .TUD). */
export async function POST(request: Request, context: { params: Promise<{ patternId: string }> }) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensurePatternLibraryLoaded();
    const { patternId } = await context.params;
    const url = new URL(request.url);
    const versionId = url.searchParams.get("version")?.trim() || null;

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required." }, { status: 400 });
    }
    const pieceNameRaw = formData.get("piece_name");
    const pieceName =
      typeof pieceNameRaw === "string" && pieceNameRaw.trim() ? pieceNameRaw.trim() : null;
    const slotRaw = formData.get("slot");
    const slot =
      typeof slotRaw === "string" && slotRaw.trim().toLowerCase() === "marker"
        ? "marker"
        : null;
    const uploadedByRaw = formData.get("uploaded_by");
    const uploadedBy =
      typeof uploadedByRaw === "string" && uploadedByRaw.trim()
        ? uploadedByRaw.trim()
        : "api";

    const stored = await storeLibraryUpload(file, patternId, uploadedBy, {
      forceKind: slot === "marker" ? "marker" : null,
    });
    if (!stored.ok) {
      return NextResponse.json({ error: stored.error }, { status: 400 });
    }

    const result = await attachClientPatternFile(patternId, versionId, stored.attachment, {
      piece_name: pieceName,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const uploaded =
      result.pattern.files.find((candidate) => candidate.id === stored.attachment.id) ??
      result.pattern.versions
        .flatMap((version) => version.files)
        .find((candidate) => candidate.id === stored.attachment.id) ??
      stored.attachment;

    await notifyLibraryFileUploaded({
      client_pattern_id: patternId,
      version_id: versionId,
      file_id: uploaded.id,
      filename: uploaded.filename,
      kind: uploaded.kind,
      piece_name: uploaded.piece_name ?? pieceName,
      uploaded_by: uploadedBy,
      source: "api",
      ...tudNotificationFields(uploaded),
      ...tumNotificationFields(uploaded),
      ...dxfNotificationFields(uploaded),
      ...rulNotificationFields(uploaded),
    });

    let tudFill: TudFillSuggestion | null = null;
    if (uploaded.tud) {
      const store = await readPatternLibraryFresh();
      tudFill = buildTudFillSuggestion({
        pattern: result.pattern,
        basePatterns: store.base_patterns,
        attachment: uploaded,
        versionId,
      });
    }

    return NextResponse.json(
      { pattern: result.pattern, file: uploaded, tud_fill: tudFill, source: "api" },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to upload client pattern file (API):", error);
    return NextResponse.json({ error: "Failed to upload file." }, { status: 500 });
  }
}

export async function GET(request: Request, context: { params: Promise<{ patternId: string }> }) {
  const authError = verifyApiKey(request);
  if (authError) return authError;

  try {
    await ensurePatternLibraryLoaded();
    const { patternId } = await context.params;
    const url = new URL(request.url);
    const storedFilename = url.searchParams.get("file")?.trim() ?? "";
    if (!storedFilename) {
      return NextResponse.json({ error: "file query param required." }, { status: 400 });
    }

    const pattern = await getClientPatternByIdFresh(patternId);
    if (!pattern) {
      return NextResponse.json({ error: "Client pattern not found." }, { status: 404 });
    }
    const allFiles = [
      ...pattern.files,
      ...pattern.versions.flatMap((version) => version.files),
    ];
    let resolved = resolveLibraryFileRequest(allFiles, storedFilename);
    if (!resolved) {
      const library = await readPatternLibraryFresh();
      for (const candidate of library.client_patterns) {
        if (candidate.id === patternId) continue;
        const candidateFiles = [
          ...candidate.files,
          ...candidate.versions.flatMap((version) => version.files),
        ];
        resolved = resolveLibraryFileRequest(candidateFiles, storedFilename);
        if (resolved) break;
      }
    }
    if (!resolved) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    const content = await readPatternLibraryFile(storedFilename);
    if (!content) {
      return NextResponse.json({ error: "File not found in storage." }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(content), {
      headers: resolved.isThumbnail
        ? {
            "Content-Type": "image/jpeg",
            "Content-Disposition": `inline; filename="${resolved.meta.filename}.thumb.jpg"`,
            "Cache-Control": "private, max-age=31536000, immutable",
          }
        : {
            "Content-Type": resolved.meta.content_type,
            "Content-Disposition": `attachment; filename="${resolved.meta.filename}"`,
          },
    });
  } catch (error) {
    console.error("Failed to download client pattern file (API):", error);
    return NextResponse.json({ error: "Failed to download file." }, { status: 500 });
  }
}
