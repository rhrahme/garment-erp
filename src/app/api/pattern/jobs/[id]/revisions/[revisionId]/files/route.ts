import { NextResponse } from "next/server";
import { requirePatternAccess } from "@/lib/auth/session";
import { ensurePatternDocumentsLoaded } from "@/lib/data/pattern-jobs";
import { writePatternFile } from "@/lib/data/pattern-file-storage";
import { attachPatternRevisionFile } from "@/lib/pattern/mutations";
import type { PatternFileKind } from "@/lib/types/pattern";

function detectFileKind(filename: string, mimeType: string | null): PatternFileKind | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf") || mimeType === "application/pdf") return "pdf";
  if (lower.endsWith(".dxf") || mimeType?.includes("dxf")) return "dxf";
  return null;
}

export async function POST(request: Request, context: { params: Promise<{ id: string; revisionId: string }> }) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }

    await ensurePatternDocumentsLoaded();
    const { id, revisionId } = await context.params;

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required." }, { status: 400 });
    }

    const kind = detectFileKind(file.name, file.type || null);
    if (!kind) {
      return NextResponse.json({ error: "Only DXF and PDF files are allowed." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const storedFilename = `${id}-${revisionId}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    await writePatternFile(storedFilename, buffer, kind);

    const result = await attachPatternRevisionFile(id, revisionId, {
      id: `pfile-${Date.now()}`,
      kind,
      filename: file.name,
      stored_filename: storedFilename,
      uploaded_at: new Date().toISOString(),
      uploaded_by: session.email,
      size_bytes: buffer.length,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ job: result.job, revision: result.revision }, { status: 201 });
  } catch (error) {
    console.error("Failed to upload pattern file:", error);
    return NextResponse.json({ error: "Failed to upload file." }, { status: 500 });
  }
}

export async function GET(request: Request, context: { params: Promise<{ id: string; revisionId: string }> }) {
  try {
    const session = await requirePatternAccess();
    if (!session) {
      return NextResponse.json({ error: "Pattern access required." }, { status: 403 });
    }

    await ensurePatternDocumentsLoaded();
    const { id, revisionId } = await context.params;
    const url = new URL(request.url);
    const storedFilename = url.searchParams.get("file")?.trim() ?? "";
    if (!storedFilename) {
      return NextResponse.json({ error: "file query param required." }, { status: 400 });
    }

    const { readPatternFile } = await import("@/lib/data/pattern-file-storage");
    const { getPatternJobById } = await import("@/lib/data/pattern-jobs");

    const job = getPatternJobById(id);
    if (!job) {
      return NextResponse.json({ error: "Pattern job not found." }, { status: 404 });
    }

    const revision = job.revisions.find((r) => r.id === revisionId);
    const fileMeta = revision?.pattern_files.find((f) => f.stored_filename === storedFilename);
    if (!fileMeta) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    const content = await readPatternFile(storedFilename);
    if (!content) {
      return NextResponse.json({ error: "File not found in storage." }, { status: 404 });
    }

    const mime = fileMeta.kind === "pdf" ? "application/pdf" : "application/dxf";
    return new NextResponse(content, {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename="${fileMeta.filename}"`,
      },
    });
  } catch (error) {
    console.error("Failed to download pattern file:", error);
    return NextResponse.json({ error: "Failed to download file." }, { status: 500 });
  }
}
