import { NextResponse } from "next/server";
import { requireAuthenticated } from "@/lib/auth/session";
import { readDrapersSwatchFileAsync } from "@/lib/fabric-sourcing/drapers-swatches";
import {
  fetchRemoteSwatchBytes,
  isRemoteSwatchUrl,
  resolveDrapersSwatchUrls,
} from "@/lib/fabric-sourcing/resolve-drapers-swatch-urls.server";

function imageResponse(buffer: Buffer, contentType: string, filename: string): NextResponse {
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${filename}"`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, max-age=86400",
    },
  });
}

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
    const local = await readDrapersSwatchFileAsync(fabricNumber);
    if (local) {
      return imageResponse(local.buffer, local.contentType, local.filename);
    }

    const resolved = await resolveDrapersSwatchUrls(fabricNumber);
    const remoteUrl = resolved.square;
    if (resolved.ok && remoteUrl && isRemoteSwatchUrl(remoteUrl)) {
      const remote = await fetchRemoteSwatchBytes(remoteUrl);
      if (remote) {
        return imageResponse(remote, "image/jpeg", `${resolved.fabric_number}.jpg`);
      }
    }

    return NextResponse.json({ error: "Swatch image not found." }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to open Drapers swatch image.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
