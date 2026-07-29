import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { readCaccioppoliSwatchFileAsync } from "@/lib/fabric-sourcing/caccioppoli-swatches";

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
    const file = await readCaccioppoliSwatchFileAsync(fabricNumber);
    if (!file) {
      return NextResponse.json({ error: "Swatch image not found." }, { status: 404 });
    }

    return new NextResponse(file.buffer, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `inline; filename="${file.filename}"`,
        "Content-Length": String(file.buffer.length),
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to open Caccioppoli swatch image.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
