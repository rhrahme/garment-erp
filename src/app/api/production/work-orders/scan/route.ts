import { NextResponse } from "next/server";
import { scanStickerForProduction } from "@/lib/production/sticker-scan";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { sticker_code?: string };
    const sticker_code = String(body.sticker_code ?? "").trim();
    if (!sticker_code) {
      return NextResponse.json({ error: "Enter a sticker code." }, { status: 400 });
    }

    const result = scanStickerForProduction(sticker_code);
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to scan sticker.";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
