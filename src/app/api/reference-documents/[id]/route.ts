import fs from "fs";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import {
  contentTypeForReferenceFilename,
  getReferenceSourceFileById,
} from "@/lib/data/reference-source-files";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await context.params;
    const file = getReferenceSourceFileById(id);
    if (!file) {
      return NextResponse.json({ error: "Reference document not found." }, { status: 404 });
    }

    const content = fs.readFileSync(file.absolutePath);
    return new NextResponse(content, {
      headers: {
        "Content-Type": contentTypeForReferenceFilename(file.absolutePath),
        "Content-Disposition": `inline; filename="${file.filename}"`,
        "Content-Length": String(content.length),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to open reference document.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
