import { NextResponse } from "next/server";
import { requirePatternAccess } from "@/lib/auth/session";
import {
  ensurePatternLibraryLoaded,
  getClientPatternByIdFresh,
} from "@/lib/data/pattern-library";
import { readPatternLibraryFile } from "@/lib/pattern-library/file-storage";
import { attachClientPatternFile } from "@/lib/pattern-library/mutations";
import { notifyLibraryFileUploaded, storeLibraryUpload } from "@/lib/pattern-library/upload";

/** Uploads attach to the pattern itself, or to a specific trial via ?version=<versionId>. */
export async function POST(request: Request, context: { params: Promise<{ patternId: string }> }) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }
    await ensurePatternLibraryLoaded();
    const { patternId } = await context.params;
    const url = new URL(request.url);
    const versionId = url.searchParams.get("version")?.trim() || null;

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required." }, { status: 400 });
    }

    const stored = await storeLibraryUpload(file, patternId, session.email);
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
      uploaded_by: session.email,
    });

    return NextResponse.json({ pattern: result.pattern, file: stored.attachment }, { status: 201 });
  } catch (error) {
    console.error("Failed to upload client pattern file:", error);
    return NextResponse.json({ error: "Failed to upload file." }, { status: 500 });
  }
}

export async function GET(request: Request, context: { params: Promise<{ patternId: string }> }) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }
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
    const fileMeta =
      pattern.files.find((f) => f.stored_filename === storedFilename) ??
      pattern.versions
        .flatMap((version) => version.files)
        .find((f) => f.stored_filename === storedFilename);
    if (!fileMeta) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    const content = await readPatternLibraryFile(storedFilename);
    if (!content) {
      return NextResponse.json({ error: "File not found in storage." }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(content), {
      headers: {
        "Content-Type": fileMeta.content_type,
        "Content-Disposition": `attachment; filename="${fileMeta.filename}"`,
      },
    });
  } catch (error) {
    console.error("Failed to download client pattern file:", error);
    return NextResponse.json({ error: "Failed to download file." }, { status: 500 });
  }
}
