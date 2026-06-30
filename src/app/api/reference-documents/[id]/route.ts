import fs from "fs";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { generateRiyadhBankDetailsPdf } from "@/lib/invoicing/generate-riyadh-bank-details-pdf";
import {
  contentTypeForReferenceFilename,
  getReferenceSourceFileById,
  isDynamicallyGeneratedReferenceFile,
} from "@/lib/data/reference-source-files";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id } = await context.params;

    if (isDynamicallyGeneratedReferenceFile(id)) {
      if (id === "riyadh-bank-details") {
        const pdfBytes = generateRiyadhBankDetailsPdf();
        return new NextResponse(Buffer.from(pdfBytes), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": 'attachment; filename="Riyadh bank details.pdf"',
            "Cache-Control": "private, max-age=3600",
          },
        });
      }
      return NextResponse.json({ error: "Reference document not found." }, { status: 404 });
    }

    const file = getReferenceSourceFileById(id);
    if (!file) {
      return NextResponse.json({ error: "Reference document not found." }, { status: 404 });
    }

    const content = fs.readFileSync(file.absolutePath);
    return new NextResponse(content, {
      headers: {
        "Content-Type": contentTypeForReferenceFilename(file.filename),
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Content-Length": String(content.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Failed to serve reference document:", error);
    return NextResponse.json({ error: "Failed to open reference document." }, { status: 500 });
  }
}
