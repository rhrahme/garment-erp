import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { readLoroPianaSwatchFile } from "@/lib/fabric-sourcing/loro-piana-swatches";

export async function GET(
  _request: Request,
  context: { params: Promise<{ fabricNumber: string }> }
) {
  try {
    const session = await requireAuthenticated();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { fabricNumber } = await context.params;
    const file = readLoroPianaSwatchFile(fabricNumber);
    if (!file) {
      return NextResponse.json({ error: "Swatch image not found." }, { status: 404 });
    }

    return new NextResponse(file.buffer, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `inline; filename="${file.filename}"`,
        "Content-Length": String(file.buffer.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to open Loro Piana swatch image.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
