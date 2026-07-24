import { NextResponse } from "next/server";
import { requirePatternAccess } from "@/lib/auth/session";
import { ensurePatternLibraryLoaded, getBasePatternByIdFresh } from "@/lib/data/pattern-library";
import { readPatternLibraryFile } from "@/lib/pattern-library/file-storage";
import { attachBasePatternFile } from "@/lib/pattern-library/mutations";
import { notifyLibraryFileUploaded, storeLibraryUpload } from "@/lib/pattern-library/upload";

export async function POST(request: Request, context: { params: Promise<{ baseId: string }> }) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }
    await ensurePatternLibraryLoaded();
    const { baseId } = await context.params;

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required." }, { status: 400 });
    }

    const stored = await storeLibraryUpload(file, baseId, session.email);
    if (!stored.ok) {
      return NextResponse.json({ error: stored.error }, { status: 400 });
    }

    const result = await attachBasePatternFile(baseId, stored.attachment);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await notifyLibraryFileUploaded({
      base_pattern_id: baseId,
      file_id: stored.attachment.id,
      filename: stored.attachment.filename,
      kind: stored.attachment.kind,
      uploaded_by: session.email,
    });

    return NextResponse.json({ base: result.base, file: stored.attachment }, { status: 201 });
  } catch (error) {
    console.error("Failed to upload base pattern file:", error);
    return NextResponse.json({ error: "Failed to upload file." }, { status: 500 });
  }
}

export async function GET(request: Request, context: { params: Promise<{ baseId: string }> }) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }
    await ensurePatternLibraryLoaded();
    const { baseId } = await context.params;
    const url = new URL(request.url);
    const storedFilename = url.searchParams.get("file")?.trim() ?? "";
    if (!storedFilename) {
      return NextResponse.json({ error: "file query param required." }, { status: 400 });
    }

    const base = await getBasePatternByIdFresh(baseId);
    const fileMeta = base?.files.find((f) => f.stored_filename === storedFilename);
    if (!base || !fileMeta) {
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
    console.error("Failed to download base pattern file:", error);
    return NextResponse.json({ error: "Failed to download file." }, { status: 500 });
  }
}
