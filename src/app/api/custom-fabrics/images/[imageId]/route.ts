import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import {
  convertHeicBufferToJpeg,
  looksLikeHeicMedia,
} from "@/lib/data/client-media";
import {
  ensureCustomFabricsLoaded,
  findCustomFabricImage,
} from "@/lib/data/custom-fabrics";
import { readCustomFabricSwatch } from "@/lib/data/custom-fabric-swatch-storage";

export const maxDuration = 60;

export async function GET(
  _request: Request,
  context: { params: Promise<{ imageId: string }> }
) {
  const session = await requireAuthenticated();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    await ensureCustomFabricsLoaded();
    const { imageId } = await context.params;
    const found = findCustomFabricImage(imageId);
    if (!found) {
      return NextResponse.json({ error: "Image not found." }, { status: 404 });
    }

    const content = await readCustomFabricSwatch(found.image.stored_filename);
    if (!content) {
      return NextResponse.json({ error: "Image file not found." }, { status: 404 });
    }

    let body = content;
    let contentType = found.image.content_type;
    let filename = found.image.filename;

    if (
      looksLikeHeicMedia({
        contentType: found.image.content_type,
        filename: found.image.filename,
        storedFilename: found.image.stored_filename,
        buffer: content,
      })
    ) {
      try {
        body = await convertHeicBufferToJpeg(content);
        contentType = "image/jpeg";
        filename = found.image.filename.replace(/\.hei[cf]$/i, ".jpg");
      } catch {
        return NextResponse.json(
          { error: "Could not convert HEIC photo for display. Re-upload as JPG if needed." },
          { status: 422 }
        );
      }
    }

    const dispositionFilename = filename.replace(/"/g, "");
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename="${dispositionFilename}"`,
      },
    });
  } catch (error) {
    console.error("Failed to load custom fabric image:", error);
    return NextResponse.json({ error: "Failed to load image." }, { status: 500 });
  }
}
